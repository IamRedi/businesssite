import { getOwnerPostgresPool, getPostgresPool, type Pool } from "@platform/database";
import type { OwnerAccountStatus, OwnerRole } from "./owner-auth";

export type OwnerTeamAccount = { id:string; email:string; role:OwnerRole; status:OwnerAccountStatus; mfaEnrolled:boolean; createdAt:string; lastActivityAt?:string; activeSessions:number };
export type OwnerInvitation = { id:string; email:string; role:OwnerRole; createdBy:string; createdAt:string; expiresAt:string; acceptedAt?:string; revokedAt?:string; active:boolean; deliveryStatus:"pending"|"sent"|"provider_not_configured"|"provider_error"; recipientLocale:"en"|"de" };
type FreshActor = { actorId:string; currentPasswordHash:string; totpStep:number; correlationId?:string; sessionHash?:string };
export type TeamMutationResult = | { ok:true; sessionsRevoked?:number; status?:OwnerAccountStatus; invitationId?:string } | { ok:false; reason:"forbidden"|"not_found"|"conflict"|"last_owner"|"invalid_state" };

function invitation(row:Record<string,unknown>):OwnerInvitation { return {
  id:row.id as string,email:row.email as string,role:row.role as OwnerRole,createdBy:row.created_by as string,
  createdAt:(row.created_at as Date).toISOString(),expiresAt:(row.expires_at as Date).toISOString(),
  acceptedAt:row.accepted_at?(row.accepted_at as Date).toISOString():undefined,revokedAt:row.revoked_at?(row.revoked_at as Date).toISOString():undefined,
  active:Boolean(row.active),deliveryStatus:row.delivery_status as OwnerInvitation["deliveryStatus"],recipientLocale:row.recipient_locale as OwnerInvitation["recipientLocale"],
}; }
function mutation(row:Record<string,unknown>|undefined):TeamMutationResult {
  if(!row?.ok) return {ok:false,reason:(row?.reason as "forbidden"|"not_found"|"conflict"|"last_owner"|"invalid_state")??"forbidden"};
  return {ok:true,sessionsRevoked:row.sessions_revoked===undefined?undefined:Number(row.sessions_revoked),status:(row.status as OwnerAccountStatus|null)??undefined,invitationId:(row.invitation_id as string|null)??undefined};
}

export class PostgresOwnerTeamRepository {
  private readonly pool:Pool; private readonly sessionHash?:string;
  constructor(connectionString?:string,sessionHash?:string){ this.pool=connectionString?getPostgresPool(connectionString):getOwnerPostgresPool(); this.sessionHash=sessionHash; }
  private session(input?:FreshActor){ return input?.sessionHash??this.sessionHash; }
  async recordPermissionDenial(actorId:string,permission:string,correlationId?:string){ await this.pool.query("select owner_auth_record_audit($1::jsonb)",[JSON.stringify({ownerId:actorId,action:"owner.permission_denied",outcome:"denied",correlationId,details:{category:"permission",permission}})]); }
  async recordSensitiveTeamAccess(actorId:string,correlationId?:string){ await this.pool.query("select owner_auth_record_audit($1::jsonb)",[JSON.stringify({ownerId:actorId,action:"owner.team_access",outcome:"success",correlationId,details:{category:"sensitive_view"}})]); }
  async listTeam(){ if(!this.sessionHash)return []; const result=await this.pool.query("select * from owner_team_list($1)",[this.sessionHash]); return result.rows.map((row)=>({id:row.id,email:row.email,role:row.role,status:row.status,mfaEnrolled:Boolean(row.mfa_enrolled),createdAt:row.created_at.toISOString(),lastActivityAt:row.last_activity_at?.toISOString(),activeSessions:Number(row.active_sessions)} as OwnerTeamAccount)); }
  async listInvitations(){ if(!this.sessionHash)return []; return (await this.pool.query("select * from owner_invitation_list($1)",[this.sessionHash])).rows.map(invitation); }
  async getInvitationByToken(tokenHash:string){ const row=(await this.pool.query("select * from owner_invitation_lookup($1)",[tokenHash])).rows[0]; return row?invitation(row):null; }
  async createInvitation(input:FreshActor&{email:string;role:OwnerRole;tokenHash:string;expiresAt:string;recipientLocale?:"en"|"de"}):Promise<TeamMutationResult>{ const hash=this.session(input);if(!hash)return{ok:false,reason:"forbidden"};const row=(await this.pool.query("select * from owner_invitation_create($1,$2,$3,$4,$5,$6,$7,$8,$9)",[hash,input.currentPasswordHash,input.totpStep,input.email,input.role,input.tokenHash,input.expiresAt,input.recipientLocale??"en",input.correlationId??null])).rows[0];return mutation(row); }
  async updateInvitationDelivery(invitationId:string,status:OwnerInvitation["deliveryStatus"],sessionHash=this.sessionHash){ if(!sessionHash)return false;return Boolean((await this.pool.query("select owner_invitation_delivery($1,$2,$3) as ok",[sessionHash,invitationId,status])).rows[0]?.ok); }
  async resendInvitation(input:FreshActor&{invitationId:string;tokenHash:string;expiresAt:string}):Promise<TeamMutationResult&{replacementId?:string;email?:string;role?:OwnerRole;recipientLocale?:"en"|"de"}>{ const hash=this.session(input);if(!hash)return{ok:false,reason:"forbidden"};const row=(await this.pool.query("select * from owner_invitation_resend($1,$2,$3,$4,$5,$6,$7)",[hash,input.currentPasswordHash,input.totpStep,input.invitationId,input.tokenHash,input.expiresAt,input.correlationId??null])).rows[0];if(!row?.ok)return mutation(row);return{ok:true,invitationId:row.replacement_id,replacementId:row.replacement_id,email:row.email,role:row.role,recipientLocale:row.recipient_locale}; }
  async revokeInvitation(input:FreshActor&{invitationId:string}):Promise<TeamMutationResult>{ const hash=this.session(input);if(!hash)return{ok:false,reason:"forbidden"};return mutation((await this.pool.query("select * from owner_invitation_revoke($1,$2,$3,$4,$5)",[hash,input.currentPasswordHash,input.totpStep,input.invitationId,input.correlationId??null])).rows[0]); }
  async acceptInvitation(input:{tokenHash:string;passwordHash:string;challengeHash:string;pendingMfaSecretEncrypted:string;challengeExpiresAt:string}){ const row=(await this.pool.query("select * from owner_invitation_accept($1::jsonb)",[JSON.stringify(input)])).rows[0];return row?{ownerId:row.owner_id as string,email:row.email as string,role:row.role as OwnerRole}:null; }
  private async change(input:FreshActor&{targetOwnerId:string},kind:"role"|"status"|"sessions",value:string){ const hash=this.session(input);if(!hash)return{ok:false,reason:"forbidden"} as TeamMutationResult;return mutation((await this.pool.query("select * from owner_team_change($1,$2,$3,$4,$5,$6,$7)",[hash,input.currentPasswordHash,input.totpStep,input.targetOwnerId,kind,value,input.correlationId??null])).rows[0]); }
  async changeRole(input:FreshActor&{targetOwnerId:string;role:OwnerRole}){return this.change(input,"role",input.role);}
  async changeStatus(input:FreshActor&{targetOwnerId:string;status:"active"|"disabled"}){return this.change(input,"status",input.status);}
  async revokeTargetSessions(input:FreshActor&{targetOwnerId:string}){return this.change(input,"sessions","");}
}
