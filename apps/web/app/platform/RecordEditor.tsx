'use client';
import { useState, type ReactNode } from 'react';
import { Dialog } from '../../components/product/ProductUI';
import { NavIcon } from '../../components/product/NavIcon';
import { useLocale } from '../../components/product/locale';
import styles from './platform.module.css';

export default function RecordEditor({title,summary,children,canClose,disabled=false,variant='row',action,verification,feedback}:{title:string;summary:ReactNode;children:ReactNode;canClose:()=>boolean;disabled?:boolean;variant?:'row'|'plan'|'create';action?:string;verification?:ReactNode;feedback?:ReactNode}){
 const [open,setOpen]=useState(false);const {t}=useLocale();
 return <div className={styles.record} data-variant={variant}>
  <div className={styles.recordSummary}>{summary}<button className={variant==='create'?'btn btn-primary':'btn'} type="button" data-record-editor disabled={disabled} onClick={()=>setOpen(true)}><NavIcon name={variant==='create'?'plus':'edit'}/>{action??t('إدارة','Manage')}</button></div>
  {open&&<Dialog open onClose={()=>{if(canClose())setOpen(false);}} title={title} className={styles.editor}>
   {verification}{feedback}{children}
  </Dialog>}
 </div>;
}
