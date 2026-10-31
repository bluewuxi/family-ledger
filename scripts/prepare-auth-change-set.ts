import {buildLambdaArtifacts} from './deployment-build';
import {aws,command,getStack,stackName,region,jsonFile,acquireLock} from './deployment-runtime';
import {readFileSync,writeFileSync} from 'node:fs';
async function main(){
 const release=acquireLock(`operator:auth-stack:${Date.now()}`);
 try {
 const delivery=aws<{Stacks:{Outputs:{OutputKey:string;OutputValue:string}[]}[]}>(['cloudformation','describe-stacks','--stack-name',`${stackName}-delivery`]).Stacks[0];
 const bucket=delivery.Outputs.find(o=>o.OutputKey==='ArtifactBucket')!.OutputValue;
 const role=aws<{Stacks:{Outputs:{OutputKey:string;OutputValue:string}[]}[]}>(['cloudformation','describe-stacks','--stack-name',`${stackName}-auth-operator`]).Stacks[0].Outputs.find(o=>o.OutputKey==='OperatorRoleArn')!.OutputValue;
 const build=await buildLambdaArtifacts();
 command('sam',['package','--template-file',build,'--s3-bucket',bucket,'--s3-prefix','lambda','--output-template-file','.aws-sam/deployment/auth-packaged.json','--use-json','--region',region]);
 const key=`templates/auth-operator-${Date.now()}.json`;
 aws(['s3api','put-object','--bucket',bucket,'--key',key,'--body','.aws-sam/deployment/auth-packaged.json']);
 const stack=getStack();
 const result=aws<{Id:string}>(['cloudformation','create-change-set','--cli-input-json',jsonFile('auth-create-change-set.json',{StackName:stackName,ChangeSetName:`auth-cutover-${Date.now()}`,ChangeSetType:'UPDATE',RoleARN:role,TemplateURL:`https://${bucket}.s3.${region}.amazonaws.com/${key}`,Parameters:stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true})),Capabilities:['CAPABILITY_IAM','CAPABILITY_NAMED_IAM'],Tags:stack.Tags,Description:'TEST AUTH operator cutover; reviewed infrastructure plus coordinated backend code'})]);
 writeFileSync('.local/auth-migration/change-set.json',JSON.stringify(result));
 console.log('Prepared TEST AUTH change set; execution requires inspection.');
 } finally{release();}
}
main().catch(()=>{console.error('AUTH change-set preparation failed; no credentials printed.');process.exitCode=1;});
