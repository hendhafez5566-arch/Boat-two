import {Injectable,Logger,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {AssignmentService} from './assignment.service';
@Injectable()
export class AssignmentRecoveryService implements OnModuleInit,OnModuleDestroy{
 private timer?:NodeJS.Timeout;private running=false;private after:string|null=null;private log=new Logger(AssignmentRecoveryService.name);
 constructor(private db:DatabaseService,private assignment:AssignmentService){}
 onModuleInit(){if(process.env.NODE_ENV!=='test'){this.timer=setInterval(()=>void this.tick(),30000);this.timer.unref();}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async tick(){
  if(this.running)return;this.running=true;
  try{
   const due=await this.db.query('SELECT * FROM assignment_recovery_tenants($1,10)',[this.after]);
   if(!due.rows.length){this.after=null;return;}
   for(const row of due.rows){this.after=row.tenant_id;try{await this.assignment.retryWaiting(row.tenant_id,true);}catch{this.log.warn('Assignment recovery retained queued work for the next pass');}}
  }catch{this.log.warn('Assignment recovery scan will retry');}finally{this.running=false;}
 }
}
