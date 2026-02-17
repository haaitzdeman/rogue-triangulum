/**
 * Untyped Supabase Client
 *
 * Centralized type-cast helper for tables NOT covered by generated
 * database.types.ts (e.g. broker_trade_fills).
 *
 * WHY: Our Database type was manually extended and does not include
 * broker_trade_fills. The typed .from('broker_trade_fills') resolves
 * to 'never', breaking all chained methods. Instead of scattering
 * `as any` across every callsite, we centralize ONE cast here.
 *
 * USAGE:
 *   import { untypedFrom } from '@/lib/supabase/untyped';
 *   const { data, error } = await untypedFrom('broker_trade_fills').select('*');
 *
 * WHEN TO REMOVE: Once database.types.ts is regenerated from the live
 * schema (npx supabase gen types typescript), delete this file and
 * switch all callers to the typed client.
 */

import { supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedQueryBuilder = any;

/**
 * Get an untyped query builder for a table not covered by Database types.
 * Equivalent to `supabase.from(table)` but without type errors.
 */
export function untypedFrom(table: string): UntypedQueryBuilder {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (supabase as any).from(table);
}
