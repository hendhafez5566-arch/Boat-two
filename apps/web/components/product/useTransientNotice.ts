'use client';
import {useEffect,useRef} from 'react';
/** Transient success/copy feedback only, not durable warnings. */
export function useTransientNotice(value:unknown,clear:()=>void,duration=4000){
 const latest=useRef(clear);latest.current=clear;
 useEffect(()=>{if(!value)return;const timer=window.setTimeout(()=>latest.current(),duration);return()=>window.clearTimeout(timer);},[value,duration]);
}
