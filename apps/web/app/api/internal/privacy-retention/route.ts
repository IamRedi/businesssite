import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PostgresPrivacyRepository, runPrivacyRetentionScheduler } from "@platform/site-data";

export async function POST(request:Request){
  const secret=process.env.CRON_SECRET?.trim(); const authorization=request.headers.get("authorization");
  if(!secret||authorization!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized."},{status:401});
  const result=await runPrivacyRetentionScheduler({repository:new PostgresPrivacyRepository({boundary:"system"}),workerReference:`privacy-${randomUUID()}`,environment:process.env});
  return NextResponse.json(result);
}
