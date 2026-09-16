'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
export default function TodayHomeNav(){const path=usePathname();useEffect(()=>{if(path!=='/')return;const nav=document.querySelector('.actions');if(!nav||nav.querySelector('[data-today-md]'))return;const b=document.createElement('button');b.textContent='오늘의 MD';b.dataset.todayMd='true';b.onclick=()=>{location.href='/today'};const dashboard=nav.querySelector('button');dashboard?.after(b)},[path]);return null;}
