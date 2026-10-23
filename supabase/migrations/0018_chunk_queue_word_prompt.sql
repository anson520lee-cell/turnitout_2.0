-- Content-blind candidate prompt (word1) for the backtest queue. Test-only: the live report prompt is unchanged.
alter table public.chunk_queue drop constraint if exists chunk_queue_prompt_name_check;
alter table public.chunk_queue add constraint chunk_queue_prompt_name_check
  check (prompt_name in ('strict1', 'slip1', 'struct1', 'mix1', 'reg1', 'reg2', 'word1'));
