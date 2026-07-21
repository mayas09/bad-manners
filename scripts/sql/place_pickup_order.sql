-- H3 fix (pay-on-pickup path): atomic order + items + optional reward redemption.
-- Called from a server function running with the caller's Supabase session,
-- so we re-verify the customer_id against auth.uid() inside the function.
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

  if p_redeem_free_drink then
    update public.profiles
      set free_drinks_available = free_drinks_available - 1
      where id = v_uid
        and coalesce(free_drinks_available, 0) > 0
      returning free_drinks_available into v_available;

    if v_available is null then
      raise exception 'No free drink available to redeem';
    end if;
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
