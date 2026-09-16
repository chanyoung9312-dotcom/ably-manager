'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
export default function TodayHomeNav(){const path=usePathname();useEffect(()=>{if(path!=='/')return;const nav=document.querySelector('.actions');if(!nav)return;const buttons=[...nav.querySelectorAll('button')];const product=buttons.find(b=>b.textContent?.includes('상품별 판매분석')||b.textContent?.trim()==='상품 분석'||b.textContent?.trim()==='오늘의 MD');if(product){product.textContent='상품 분석';product.onclick=()=>{location.href='/products'}}let today=nav.querySelector('[data-today-md]');if(!today){today=document.createElement('button');today.dataset.todayMd='true';today.textContent='오늘의 MD';today.onclick=()=>{location.href='/today'};product?.after(today)}},[path]);return null;}
