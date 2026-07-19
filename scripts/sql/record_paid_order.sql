-- Atomic paid-order recording: order + items + optional reward redemption in one transaction.
-- Run this in the Supabase SQL Editor (project nhncjaudtnplatwvbcab).
-- Called by server code (service role) from Stripe finalize + webhook. Idempotent by stripe_session_id.

create or replace function public.record_paid_order(
  p_order_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_subtotal_cents integer,
  p_total_cents integer,
  p_discount_cents integer,
  p_pickup_time text,
  p_order_notes text,
  p_stripe_session_id text,
  p_stripe_payment_intent text,
  p_items jsonb
)
returns table(order_id uuid, order_number bigint, already_existed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_existing_number bigint;
  v_existing_customer uuid;
  v_new_number bigint;
begin
  select o.id, o.order_number, o.customer_id
    into v_existing_id, v_existing_number, v_existing_customer
  from public.orders o
  where o.stripe_session_id = p_stripe_session_id
  limit 1;

  if v_existing_id is not null then
    if v_existing_customer is distinct from p_customer_id then
      raise exception 'Order customer mismatch';
    end if;
    order_id := v_existing_id;
    order_number := v_existing_number;
    already_existed := true;
    return next;
    return;
  end if;

  insert into public.orders (
    id, customer_id, customer_name, customer_phone, customer_email,
    subtotal_cents, total_cents, discount_cents,
    pickup_time, order_notes,
    payment_status, status,
    stripe_session_id, stripe_payment_intent
  ) values (
    p_order_id, p_customer_id, p_customer_name, p_customer_phone, p_customer_email,
    p_subtotal_cents, p_total_cents, p_discount_cents,
    p_pickup_time, nullif(p_order_notes, ''),
    'paid', 'confirmed',
    p_stripe_session_id, p_stripe_payment_intent
  )
  returning orders.id, orders.order_number into v_existing_id, v_new_number;

  insert into public.order_items (order_id, menu_item_id, name, quantity, unit_price_cents, special_notes)
  select
    v_existing_id,
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

  if p_discount_cents > 0 then
    update public.profiles
      set free_drinks_available = greatest(0, coalesce(free_drinks_available, 0) - 1)
      where id = p_customer_id;
  end if;

  order_id := v_existing_id;
  order_number := v_new_number;
  already_existed := false;
  return next;
end;
$$;

revoke execute on function public.record_paid_order(
  uuid, uuid, text, text, text, integer, integer, integer, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.record_paid_order(
  uuid, uuid, text, text, text, integer, integer, integer, text, text, text, text, jsonb
) to service_role;
