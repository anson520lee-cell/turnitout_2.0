-- Prices were cut to a fifth on 2026-10-25 (reports: 1 credit per 1,000 characters,
-- minimum 2; refinement: 1 credit per 1,000 characters, minimum 3). Orders that
-- were made earlier and are still unpaid keep their old price in the order list
-- until someone opens them (the app re-prices an unpaid order whenever it is
-- shown or paid, which is the authority). This brings the stored price in line
-- right away. Prices are stored in cents: 100 = 1 credit.
update public.orders o
   set price = 100 * greatest(
         case when o.service_type = 'refinement' then 3 else 2 end,
         ceil(
           case when o.service_type = 'refinement'
             then c.chars
             else (c.chars / 20000) * 8000 + least(8000, c.chars % 20000)
           end / 1000.0
         )::int
       )
  from (
    select id, char_length(btrim(regexp_replace(source_text, '\s+', ' ', 'g'))) as chars
      from public.orders
     where status = 'awaiting_payment' and price > 0 and source_text is not null
  ) c
 where o.id = c.id;
