/** Compose operator SQL without shell interpolation. The guard and mutation share one ledger lock. */
export function sqlText(value: string): string { return "'" + value.replaceAll("'", "''") + "'"; }
export function guardedTransaction(input: { revision: string; fingerprint: string }, statements: string): string {
  return `begin; set local lock_timeout='10s';
    do $kernel_guard$ begin
      perform 1 from public.ledger_write_state where id for update;
      if public.get_ledger_write_revision()<>${sqlText(input.revision)}
        or md5(public.export_ledger_backup()::text)<>${sqlText(input.fingerprint)} then
        raise exception 'Input drift';
      end if;
    end $kernel_guard$;
    ${statements}
    commit;`;
}

export function snapshotBatchTransaction(input:{revision:string;fingerprint:string},values:object[],instrumentId:string,token:string):string {
 if(values.length<1||values.length>30)throw new Error("Snapshot batch must contain 1–30 dates.");
 const json=(v:unknown)=>sqlText(JSON.stringify(v))+"::jsonb";
 const statements=values.map(v=>`perform public.upsert_portfolio_snapshot(${json(v)},public.get_ledger_write_revision());`).join("\n");
 return guardedTransaction(input,`do $kernel_batch$ begin
 if not exists(select 1 from public.kernel_nta_refresh_state where instrument_id=${sqlText(instrumentId)}::uuid and refresh_token=${sqlText(token)}::uuid) then raise exception 'Kernel token drift'; end if;
 ${statements}
 end $kernel_batch$;`);
}
