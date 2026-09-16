'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
export default function TodayHomeNav(){const path=usePathname();useEffect(()=>{if(path!=='/')return;const nav=document.querySelector('.actions');if(!nav)return;const buttons=[...nav.querySelectorAll('button')];const product=buttons.find(b=>b.textContent?.includes('상품별 판매분석')||b.textContent?.trim()==='상품 분석');if(product){product.textContent='오늘의 MD';product.onclick=()=>{location.href='/today'}}const duplicate=nav.querySelector('[data-today-md]');if(duplicate)duplicate.remove()},[path]);return null;}
