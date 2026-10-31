import { writeFileSync,mkdirSync } from "node:fs";
import { aws, command, getStack, isStableStack, output, region, stackName, readParameters, acquireLock } from "./deployment-runtime";
import { parseTemplate, type JsonObject } from "./deployment-policy";
if(process.env.GITHUB_ACTIONS) throw new Error("Operator-only.");
const live=getStack();if(!isStableStack(live.StackStatus))throw new Error("Stable TEST stack required.");
const {Account,Arn}=aws<{Account:string;Arn:string}>(["sts","get-caller-identity"]);
const partition=Arn.split(":")[1];
const arn=(service:string,resource:string,location=region)=>`arn:${partition}:${service}:${location}:${Account}:${resource}`;
const resources=aws<{StackResourceSummaries:{ResourceType:string;PhysicalResourceId:string}[]}>(["cloudformation","list-stack-resources","--stack-name",stackName]).StackResourceSummaries;
const ids=(type:string)=>resources.filter(r=>r.ResourceType===type).map(r=>r.PhysicalResourceId);
const templateBody=aws<{TemplateBody:string|JsonObject}>(["cloudformation","get-template","--stack-name",stackName,"--template-stage","Original"]).TemplateBody;
const original=typeof templateBody==='string'?parseTemplate(templateBody):templateBody;
const previousObjects=Object.values(original.Resources as Record<string,JsonObject>).flatMap(r=>{const code=(r.Properties as JsonObject)?.CodeUri;return typeof code==='string'&&code.startsWith('s3://')?[`arn:${partition}:s3:::${code.slice(5)}`]:[];});
const allow=(Action:string[],Resource:string[],extra:object={})=>({Effect:"Allow",Action,Resource,...extra});
const delivery=aws<{Stacks:{Outputs:{OutputKey:string;OutputValue:string}[]}[]}>(['cloudformation','describe-stacks','--stack-name',`${stackName}-delivery`]).Stacks[0];
const artifactBucket=delivery.Outputs.find(o=>o.OutputKey==='ArtifactBucket')?.OutputValue;if(!artifactBucket)throw new Error('Missing delivery artifacts.');
const policy={Version:"2012-10-17",Statement:[
 allow(["cloudformation:CreateChangeSet"],[`arn:${partition}:cloudformation:${region}:aws:transform/Serverless-2016-10-31`]),
 allow(["lambda:Get*","lambda:ListTags","lambda:UpdateFunctionCode","lambda:UpdateFunctionConfiguration","lambda:AddPermission","lambda:RemovePermission","lambda:TagResource","lambda:UntagResource"],ids('AWS::Lambda::Function').map(id=>arn('lambda',`function:${id}`))),
 allow(["dynamodb:CreateTable","dynamodb:DescribeTable","dynamodb:DescribeContinuousBackups","dynamodb:DescribeTimeToLive","dynamodb:UpdateContinuousBackups","dynamodb:UpdateTimeToLive","dynamodb:UpdateTable","dynamodb:ListTagsOfResource","dynamodb:TagResource","dynamodb:UntagResource","dynamodb:DeleteTable"],[arn('dynamodb',`table/${stackName}-AuthTable-*`)]),
 allow(["iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:UpdateAssumeRolePolicy","iam:PutRolePolicy","iam:DeleteRolePolicy","iam:GetRolePolicy","iam:ListRolePolicies","iam:AttachRolePolicy","iam:DetachRolePolicy","iam:ListAttachedRolePolicies","iam:TagRole","iam:UntagRole","iam:ListRoleTags"],[arn('iam',`role/${stackName}-api-role`,'')]),
 allow(['iam:GetRole','iam:GetRolePolicy','iam:ListRolePolicies','iam:ListAttachedRolePolicies','iam:ListRoleTags'],ids('AWS::IAM::Role').map(id=>arn('iam',`role/${id}`,''))),
 allow(["iam:PassRole"],[arn('iam',`role/${stackName}-api-role`,''),...ids('AWS::IAM::Role').map(id=>arn('iam',`role/${id}`,''))],{Condition:{StringEquals:{"iam:PassedToService":["lambda.amazonaws.com","scheduler.amazonaws.com"]}}}),
 allow(["apigateway:GET","apigateway:PATCH","apigateway:POST","apigateway:PUT","apigateway:DELETE"],ids('AWS::ApiGatewayV2::Api').flatMap(id=>[`arn:${partition}:apigateway:${region}::/apis/${id}`,`arn:${partition}:apigateway:${region}::/apis/${id}/*`])),
 allow(["cloudfront:GetDistribution","cloudfront:GetDistributionConfig","cloudfront:UpdateDistribution","cloudfront:ListTagsForResource","cloudfront:TagResource","cloudfront:UntagResource"],ids('AWS::CloudFront::Distribution').map(id=>arn('cloudfront',`distribution/${id}`,''))),
 allow(["s3:GetObject","s3:GetObjectVersion"],[...previousObjects,`arn:${partition}:s3:::${artifactBucket}/*`,`arn:${partition}:s3:::aws-sam-cli-managed-default-*/*`]),
 allow(["scheduler:GetSchedule","scheduler:UpdateSchedule"],ids('AWS::Scheduler::Schedule').map(id=>arn('scheduler',`schedule/default/${id}`))),
 allow(["route53:GetHostedZone"],[`arn:${partition}:route53:::hostedzone/${readParameters().HostedZoneId}`]),
 allow(["logs:DescribeLogGroups","logs:DescribeLogStreams"],[arn('logs',`log-group:/aws/lambda/${stackName}*`)]),
]};
const template={AWSTemplateFormatVersion:"2010-09-09",Description:"Dedicated operator-managed TEST authentication cutover execution role; separate from CI.",Resources:{OperatorExecutionRole:{Type:"AWS::IAM::Role",Properties:{AssumeRolePolicyDocument:{Version:"2012-10-17",Statement:[{Effect:"Allow",Principal:{Service:"cloudformation.amazonaws.com"},Action:"sts:AssumeRole"}]},Policies:[{PolicyName:"TestAuthCutover",PolicyDocument:policy}]}}},Outputs:{OperatorRoleArn:{Value:{"Fn::GetAtt":["OperatorExecutionRole","Arn"]}}}};
mkdirSync('.local/auth-migration',{recursive:true});writeFileSync('.local/auth-migration/operator-template.json',JSON.stringify(template,null,2));
console.log("Prepared scoped TEST operator template.");
if(process.argv.includes('--apply')) {
 const release=acquireLock(`operator:auth-role:${Date.now()}`);
 try{command('aws',['cloudformation','deploy','--region',region,'--stack-name',`${stackName}-auth-operator`,'--template-file','.local/auth-migration/operator-template.json','--capabilities','CAPABILITY_IAM','--no-fail-on-empty-changeset']);console.log('TEST operator role stack deployed.');}finally{release();}
}
