-- =============================================================================
-- Migration: dev_schema_check_required() RPC
--
-- SECURITY DEFINER function that checks all production-required tables and
-- columns by probing information_schema.columns.  Called exclusively by the
-- service_role via the /api/dev/schema-health route.
--
-- Returns JSONB:
-- {
--   "status":       "PASS" | "FAIL",
--   "totalChecked": <int>,
--   "found":        <int>,
--   "missing":      [ { "table": "...", "column": "..." }, ... ]
-- }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dev_schema_check_required()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ---------------------------------------------------------------------------
  -- Required table.column pairs — ground truth from production migrations.
  -- Format: 'table_name.column_name'
  -- ---------------------------------------------------------------------------
  required_checks text[] := ARRAY[
    -- broker_trade_fills (20260208)
    'broker_trade_fills.id',
    'broker_trade_fills.broker',
    'broker_trade_fills.broker_trade_id',
    'broker_trade_fills.symbol',
    'broker_trade_fills.filled_at',
    'broker_trade_fills.normalized',
    'broker_trade_fills.created_at',

    -- premarket_journal_entries — core (20260131)
    'premarket_journal_entries.id',
    'premarket_journal_entries.effective_date',
    'premarket_journal_entries.symbol',
    'premarket_journal_entries.status',
    'premarket_journal_entries.trade_direction',

    -- premarket — reconcile/scale (20260211, 20260211b)
    'premarket_journal_entries.manual_override',
    'premarket_journal_entries.entry_fill_id',
    'premarket_journal_entries.exit_fill_id',
    'premarket_journal_entries.reconcile_status',
    'premarket_journal_entries.match_explanation',
    'premarket_journal_entries.avg_entry_price',
    'premarket_journal_entries.total_qty',
    'premarket_journal_entries.exited_qty',
    'premarket_journal_entries.realized_pnl_dollars',
    'premarket_journal_entries.unrealized_pnl_dollars',

    -- premarket — risk / draft (20260211d)
    'premarket_journal_entries.risk_dollars',
    'premarket_journal_entries.is_draft',

    -- premarket — safety (20260215)
    'premarket_journal_entries.ledger_write_failed',

    -- options_journal_entries — core (20260207)
    'options_journal_entries.id',
    'options_journal_entries.created_at',
    'options_journal_entries.symbol',
    'options_journal_entries.status',

    -- options — spread + reconcile (20260211c)
    'options_journal_entries.is_spread',
    'options_journal_entries.legs_json',
    'options_journal_entries.net_debit_credit',
    'options_journal_entries.reconcile_status',
    'options_journal_entries.match_explanation',
    'options_journal_entries.manual_override',
    'options_journal_entries.realized_pnl_dollars',

    -- options — risk / draft (20260211d)
    'options_journal_entries.risk_dollars',
    'options_journal_entries.is_draft',

    -- options — safety (20260215)
    'options_journal_entries.ledger_write_failed',

    -- trade_ledger (20260211f)
    'trade_ledger.id',
    'trade_ledger.entry_id',
    'trade_ledger.desk',
    'trade_ledger.symbol',
    'trade_ledger.trade_direction',
    'trade_ledger.realized_pnl',
    'trade_ledger.created_at',

    -- morning_run_runs (20260211e)
    'morning_run_runs.id',
    'morning_run_runs.run_id',
    'morning_run_runs.run_date',
    'morning_run_runs.generated_at',
    'morning_run_runs.payload'
  ];

  total_checked int;
  found_count   int := 0;
  missing_arr   jsonb := '[]'::jsonb;
  pair          text;
  tbl           text;
  col           text;
  col_exists    boolean;
BEGIN
  total_checked := array_length(required_checks, 1);

  FOREACH pair IN ARRAY required_checks LOOP
    tbl := split_part(pair, '.', 1);
    col := split_part(pair, '.', 2);

    SELECT EXISTS (
      SELECT 1
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.table_name   = tbl
         AND c.column_name  = col
    ) INTO col_exists;

    IF col_exists THEN
      found_count := found_count + 1;
    ELSE
      missing_arr := missing_arr || jsonb_build_object('table', tbl, 'column', col);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status',       CASE WHEN jsonb_array_length(missing_arr) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'totalChecked', total_checked,
    'found',        found_count,
    'missing',      missing_arr
  );
END;
$$;

-- =============================================================================
-- Access Control — service_role only
-- =============================================================================
REVOKE ALL ON FUNCTION public.dev_schema_check_required() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dev_schema_check_required() FROM anon;
REVOKE ALL ON FUNCTION public.dev_schema_check_required() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.dev_schema_check_required() TO service_role;
