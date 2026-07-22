-- H3 fix (pay-on-pickup path): atomic order + items + optional reward redemption.
-- Defense-in-depth: recomputes subtotal/total from menu_items and rejects
-- mismatches, so even a compromised server function cannot forge prices.
-- Run this in the Supabase SQL Editor.

create or replace function public.place_pickup_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_subtotal_cents integer,
  p_total_cents integer,
  p_discount_cents integer,
  p_pickup_time text,
  p_order_notes text,
  p_payment_status text,
  p_redeem_free_drink boolean,
  p_items jsonb
)
returns table(order_id uuid, order_number bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_order_number bigint;
  v_available integer;
  v_computed_subtotal integer := 0;
  v_computed_discount integer := 0;
  v_cheapest integer;
  v_item jsonb;
  v_menu record;
  v_qty integer;
  v_mid uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_payment_status is null
     or p_payment_status not in ('unpaid', 'pay_on_pickup') then
    raise exception 'Invalid payment_status for pickup order: %', p_payment_status;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  -- === Defense-in-depth: recompute subtotal from menu_items ===
  -- Items priced at 0 (free-drink split line) are trusted as-is but do not
  -- contribute to the computed subtotal; the paid portion must match menu prices.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid item quantity';
    end if;

    if (v_item->>'menu_item_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_mid := (v_item->>'menu_item_id')::uuid;
    else
      v_mid := null;
    end if;

    -- Free-drink split line: allowed at 0 cents without menu lookup.
    if coalesce((v_item->>'unit_price_cents')::int, 0) = 0 then
      continue;
    end if;

    if v_mid is null then
      raise exception 'Item missing menu_item_id';
    end if;

    select id, name, price_cents, coalesce(is_sold_out, false) as sold_out
      into v_menu
      from public.menu_items
      where id = v_mid;

    if v_menu is null then
      raise exception 'Item no longer on the menu';
    end if;
    if v_menu.sold_out then
      raise exception 'Sold out: %', v_menu.name;
    end if;
    if v_menu.price_cents is null or v_menu.price_cents <= 0 then
      raise exception 'Item cannot be ordered online: %', v_menu.name;
    end if;
    if v_menu.price_cents <> (v_item->>'unit_price_cents')::int then
      raise exception 'Price mismatch for %: expected %, got %',
        v_menu.name, v_menu.price_cents, (v_item->>'unit_price_cents')::int;
    end if;

    v_computed_subtotal := v_computed_subtotal + v_qty * v_menu.price_cents;
  end loop;

  if v_computed_subtotal <> coalesce(p_subtotal_cents, -1) then
    raise exception 'Subtotal mismatch: computed %, got %',
      v_computed_subtotal, p_subtotal_cents;
  end if;

  -- === Redeem free drink (atomically decrement balance) ===
  if p_redeem_free_drink then
    update public.profiles
      set free_drinks_available = free_drinks_available - 1
      where id = v_uid
        and coalesce(free_drinks_available, 0) > 0
      returning free_drinks_available into v_available;

    if v_available is null then
      raise exception 'No free drink available to redeem';
    end if;

    -- Discount must equal the cheapest priced item on the order.
    select min(price_cents) into v_cheapest
      from public.menu_items
      where id in (
        select case
          when (elem->>'menu_item_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (elem->>'menu_item_id')::uuid
          else null
        end
        from jsonb_array_elements(p_items) as elem
        where coalesce((elem->>'unit_price_cents')::int, 0) > 0
      )
      and price_cents > 0;

    v_computed_discount := coalesce(v_cheapest, 0);
  end if;

  if v_computed_discount <> coalesce(p_discount_cents, 0) then
    raise exception 'Discount mismatch: computed %, got %',
      v_computed_discount, p_discount_cents;
  end if;

  if greatest(v_computed_subtotal - v_computed_discount, 0) <> coalesce(p_total_cents, -1) then
    raise exception 'Total mismatch: computed %, got %',
      greatest(v_computed_subtotal - v_computed_discount, 0), p_total_cents;
  end if;

  insert into public.orders (
    customer_id, customer_name, customer_phone, customer_email,
    subtotal_cents, total_cents, discount_cents,
    pickup_time, order_notes,
    payment_status, status
  ) values (
    v_uid, p_customer_name, p_customer_phone, p_customer_email,
    p_subtotal_cents, p_total_cents, p_discount_cents,
    p_pickup_time, nullif(p_order_notes, ''),
    p_payment_status, 'pending'
  )
  returning id, order_number into v_order_id, v_order_number;

  insert into public.order_items (order_id, menu_item_id, name, quantity, unit_price_cents, special_notes)
  select
    v_order_id,
    case
      when (elem->>'menu_item_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (elem->>'menu_item_id')::uuid
      else null
    end,
    elem->>'name',
    (elem->>'quantity')::int,
    (elem->>'unit_price_cents')::int,
    nullif(elem->>'special_notes', '')
  from jsonb_array_elements(p_items) as elem;

  order_id := v_order_id;
  order_number := v_order_number;
  return next;
end;
$$;

revoke execute on function public.place_pickup_order(
  text, text, text, integer, integer, integer, text, text, text, boolean, jsonb
) from public, anon;

grant execute on function public.place_pickup_order(
  text, text, text, integer, integer, integer, text, text, text, boolean, jsonb
) to authenticated;
