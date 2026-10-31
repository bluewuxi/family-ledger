import {readFileSync,writeFileSync} from 'node:fs';
import {aws,command,acquireLock,region,stackName} from './deployment-runtime';
const id=JSON.parse(readFileSync('.local/auth-migration/change-set.json','utf8')).Id;
const detail=aws<{Status:string;ExecutionStatus:string;Changes:{ResourceChange:{Action:string;LogicalResourceId:string;Replacement?:string}}[]}>(['cloudformation','describe-change-set','--change-set-name',id]);
const allowed=new Set(['ApiExecutionRole','ApiFunction','ApiInvokeMarketDataJobsPolicy','AuthTable','BackupLedgerDataFunction','BackupLedgerDataSchedulerSchedule','GeneratePortfolioSnapshotsFunction','GeneratePortfolioSnapshotsSchedulerSchedule','LedgerHttpApiApiGatewayDefaultStage','LedgerHttpApi','UpdateFxRatesFunction','UpdateFxRatesSchedulerSchedule','UpdatePricesFunction','UpdatePricesSchedulerSchedule','WebSecurityHeadersPolicy']);
if(detail.Status!=='CREATE_COMPLETE'||detail.ExecutionStatus!=='AVAILABLE'||detail.Changes.some(c=>!allowed.has(c.ResourceChange.LogicalResourceId)||c.ResourceChange.Action==='Remove'||c.ResourceChange.Replacement==='True'))throw new Error('Change set differs from reviewed scope.');
const release=acquireLock(`operator:execute-auth:${Date.now()}`);
try {
 aws(['cloudformation','execute-change-set','--change-set-name',id]);
 console.log('Executing reviewed AUTH change set.');
 command('aws',['cloudformation','wait','stack-update-complete','--stack-name',stackName,'--region',region]);
 writeFileSync('.local/auth-migration/stack-update-result.json',JSON.stringify({passed:true,changeSet:id,completedAt:new Date().toISOString()}));
 console.log('TEST AUTH stack update complete.');
} finally {release();}
