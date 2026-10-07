-- Top-ups are bought in whole US dollars (`usd`); `amount` stays the credits
-- granted (see CREDITS_PER_USD in config/pricing.ts). Apply after 0006.
alter table public.credit_topups add column usd integer check (usd between 1 and 100000);
update public.credit_topups set usd = greatest(1, round(amount / 7.8)) where usd is null;
alter table public.credit_topups alter column usd set not null;
