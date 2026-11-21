-- Read models for list screens. security_invoker ⇒ the caller's RLS applies.
create view shift_overview with (security_invoker = true) as
select s.*,
  m.full_name as member_name, t.name as terminal_name,
  (select count(*) from sales x where x.shift_id = s.id and x.status <> 'voided') as sales_count,
  (select coalesce(sum(x.total), 0) from sales x where x.shift_id = s.id and x.status <> 'voided') as sales_total,
  (select coalesce(sum(p.amount), 0) from payments p join sales x on x.id = p.sale_id where x.shift_id = s.id and x.status <> 'voided' and p.method = 'cash')
    - (select coalesce(sum(x.change_due), 0) from sales x where x.shift_id = s.id and x.status <> 'voided') as cash_total,
  (select coalesce(sum(p.amount), 0) from payments p join sales x on x.id = p.sale_id where x.shift_id = s.id and x.status <> 'voided' and p.method = 'momo') as momo_total,
  (select coalesce(sum(p.amount), 0) from payments p join sales x on x.id = p.sale_id where x.shift_id = s.id and x.status <> 'voided' and p.method = 'card') as card_total,
  (select coalesce(sum(p.amount), 0) from payments p join sales x on x.id = p.sale_id where x.shift_id = s.id and x.status <> 'voided' and p.method = 'bank') as bank_total,
  coalesce(s.expected_cash, shift_expected_cash(s.id)) as expected_cash_now
from shifts s
join business_members m on m.id = s.member_id
join pos_terminals t on t.id = s.terminal_id;

grant select on shift_overview to authenticated;
