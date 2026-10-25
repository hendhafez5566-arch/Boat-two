'use client';
import {useEffect,useState,useCallback} from 'react';
import {channelHref,selectedChannel} from '../../lib/channel-context';
export function useChannelContext():[string,(value:string)=>void]{
 const [channelId,setChannelId]=useState('');
 useEffect(()=>{const read=()=>setChannelId(selectedChannel(window.location.search));read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
 const select=useCallback((value:string)=>{setChannelId(value);window.history.replaceState(window.history.state,'',channelHref(window.location.pathname+window.location.search,value)+window.location.hash);},[]);
 return[channelId,select];
}
