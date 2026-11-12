const iconPaths = {
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  star:'<path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9L12 3Z"/>',
  book:'<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22V4.5ZM20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22V4.5Z"/>',
  filter:'<path d="M4 5h16M7 12h10M10 19h4"/><circle cx="8" cy="5" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="12" cy="19" r="2" fill="var(--surface)"/>',
  wallet:'<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V6.5Z"/><path d="M4 8h16M15 12h6v5h-6a2.5 2.5 0 0 1 0-5Z"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.35.38.57.85.6 1.4V11h1v4h-.09a1.7 1.7 0 0 0-1.51 0Z"/>',
  more:'<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  moon:'<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  'chevron-right':'<path d="m9 18 6-6-6-6"/>',
  'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  'arrow-right':'<path d="M5 12h14M14 7l5 5-5 5"/>',
  upload:'<path d="M12 16V3M7 8l5-5 5 5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  download:'<path d="M12 3v13M7 11l5 5 5-5M4 19v2h16v-2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  activity:'<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10"/>',
  columns:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  expand:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.14-1.14"/>',
  sparkles:'<path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2L12 3ZM5 13l-1 2.5L1.5 16.5 4 17.5 5 20l1-2.5 2.5-1L6 15.5 5 13ZM18.5 13l-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8-.8-2.2Z"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  play:'<path d="m8 5 11 7-11 7V5Z"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>',
  eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  cash:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9H6v1M17 15h1v-1"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
};
function iconSvg(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.more}</svg>`}
function hydrateIcons(root=document){root.querySelectorAll('i[data-icon]').forEach(el=>{if(!el.querySelector('svg'))el.innerHTML=iconSvg(el.dataset.icon)})}
hydrateIcons();

const pageNames={dashboard:'看盘台',watch:'自选与持仓',research:'研究库',screener:'条件选股',accounts:'账户收益'};
let currentPage='dashboard';
function switchPage(page,updateHash=true){
  if(!pageNames[page])return;
  currentPage=page;
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  document.querySelectorAll('.nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  document.querySelector('.main-content').scrollTop=0;
  if(updateHash)history.replaceState(null,'',`#${page}`);
  closeModal('search-modal');
  requestAnimationFrame(renderAllCharts);
}
document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>switchPage(btn.dataset.page)));
document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>switchPage(btn.dataset.nav)));
document.querySelectorAll('[data-go-watch]').forEach(btn=>btn.addEventListener('click',()=>switchPage('watch')));
const initialPage=location.hash.slice(1);
if(pageNames[initialPage])switchPage(initialPage,false);

let toastTimer;
function toast(message){const el=document.getElementById('toast');el.querySelector('span').textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100)}
function openModal(id){document.getElementById(id).hidden=false;if(id==='search-modal')setTimeout(()=>document.getElementById('command-input').focus(),30)}
function closeModal(id){document.getElementById(id).hidden=true}
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('mousedown',e=>{if(e.target===backdrop)backdrop.hidden=true}));
document.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('.modal-backdrop').hidden=true));
document.getElementById('search-button').addEventListener('click',()=>openModal('search-modal'));
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openModal('search-modal')}
  if(e.key==='Escape'){document.querySelectorAll('.modal-backdrop,.drawer-backdrop').forEach(el=>el.hidden=true)}
  if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&['INPUT','TEXTAREA','SELECT'].indexOf(document.activeElement.tagName)<0&&['1','2','3','4','5'].includes(e.key)){
    switchPage(['dashboard','watch','research','screener','accounts'][Number(e.key)-1]);
  }
});
document.querySelectorAll('[data-command-stock]').forEach(btn=>btn.addEventListener('click',()=>{switchPage('watch');selectStock(btn.dataset.commandStock)}));

document.getElementById('theme-button').addEventListener('click',()=>{
  document.body.classList.toggle('light');
  const light=document.body.classList.contains('light');
  const btn=document.getElementById('theme-button');
  btn.innerHTML=`<i data-icon="${light?'moon':'sun'}"></i>`;hydrateIcons(btn);renderAllCharts();
});
document.getElementById('settings-button').addEventListener('click',()=>toast('设置原型：外观、行情、快捷键与同步'));
document.getElementById('data-health').addEventListener('click',()=>toast('东方财富、腾讯、Yahoo：当前均正常'));
document.getElementById('add-watch-button').addEventListener('click',()=>openModal('search-modal'));
document.querySelectorAll('.index-card').forEach(card=>card.addEventListener('click',()=>{document.querySelectorAll('.index-card').forEach(el=>el.classList.remove('selected'));card.classList.add('selected');toast(`已选中 ${card.dataset.symbol}，可展开完整 K 线`)}));
document.querySelectorAll('.segmented').forEach(group=>group.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){group.querySelectorAll('button').forEach(b=>b.classList.remove('active'));e.target.classList.add('active')}}));
document.querySelectorAll('.inline-tabs').forEach(group=>group.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){group.querySelectorAll('button').forEach(b=>b.classList.remove('active'));e.target.classList.add('active')}}));
document.querySelectorAll('.filter-chip').forEach(chip=>chip.addEventListener('click',()=>{document.querySelectorAll('.filter-chip').forEach(el=>el.classList.remove('active'));chip.classList.add('active')}));

const stocks={
  '新易盛':{code:'300502 · SZ',price:'386.20',change:'+30.02  +8.42%',dir:'up',seed:8,status:'已完成',attitude:'看好',conclusion:'高速光模块产品竞争力明确，海外算力资本开支仍是核心驱动，需持续跟踪客户集中度。'},
  '中际旭创':{code:'300308 · SZ',price:'298.66',change:'+17.38  +6.18%',dir:'up',seed:12,status:'已完成',attitude:'看好',conclusion:'规模优势与盈利质量较好，重点跟踪下一代产品迭代节奏和大客户订单兑现。'},
  '招商银行':{code:'600036 · SH',price:'42.18',change:'+0.36  +0.86%',dir:'up',seed:18,status:'已完成',attitude:'看好',conclusion:'高股息底仓，零售业务优势明显，后续重点关注资产质量与分红持续性。'},
  '腾讯控股':{code:'00700 · HK',price:'612.00',change:'−6.94  −1.12%',dir:'down',seed:22,status:'待研究',attitude:'中性',conclusion:'游戏与广告基本盘稳健，AI 投入回报仍需进一步验证，等待研究完成后形成结论。'},
  '苹果':{code:'AAPL · US',price:'268.42',change:'−0.97  −0.36%',dir:'down',seed:30,status:'待研究',attitude:'未设态度',conclusion:'尚未形成研究结论。加入研究清单后，可在外部完成研究并导入报告。'}
};
let activeStock='新易盛';let activeSeed=8;let activePeriod='日K';
function selectStock(name){
  const stock=stocks[name];if(!stock)return;activeStock=name;activeSeed=stock.seed;
  document.querySelectorAll('#watch-table-body tr').forEach(row=>row.classList.toggle('selected',row.dataset.stock===name));
  document.getElementById('chart-stock-name').textContent=name;
  document.getElementById('chart-stock-code').textContent=stock.code;
  document.getElementById('chart-stock-price').textContent=stock.price;
  const change=document.getElementById('chart-stock-change');change.textContent=stock.change;change.className=stock.dir;
  document.getElementById('summary-status').textContent=stock.status;
  document.getElementById('summary-status').className=`research-state ${stock.status==='已完成'?'done':stock.status==='待研究'?'doing':'todo'}`;
  document.getElementById('summary-attitude').textContent=stock.attitude;
  document.getElementById('summary-conclusion').textContent=stock.conclusion;
  renderCandleChart(document.getElementById('main-candle-chart'),activeSeed,stock.dir);
}
document.querySelectorAll('#watch-table-body tr').forEach(row=>row.addEventListener('click',()=>selectStock(row.dataset.stock)));
document.querySelectorAll('[data-open-stock]').forEach(row=>row.addEventListener('click',()=>{switchPage('watch');selectStock(row.dataset.openStock)}));
document.querySelectorAll('.timeframes [data-period]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.timeframes [data-period]').forEach(el=>el.classList.remove('active'));btn.classList.add('active');activePeriod=btn.dataset.period;
  document.getElementById('chart-period-label').textContent=activePeriod==='日K'?'2026/11/10':`${activePeriod} · 2026/11/10`;
  renderCandleChart(document.getElementById('main-candle-chart'),activeSeed+Math.floor(Math.random()*3),stocks[activeStock].dir);
  toast(`已切换至 ${btn.textContent} · 仅显示价格与成交量`);
}));
document.addEventListener('keydown',e=>{
  if(currentPage!=='watch'||['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  e.preventDefault();const names=Object.keys(stocks);let i=names.indexOf(activeStock);i=(i+(e.key==='ArrowDown'?1:-1)+names.length)%names.length;selectStock(names[i]);
});

const drawer=document.getElementById('sector-drawer');
document.querySelectorAll('.sector-row').forEach(row=>row.addEventListener('click',()=>{
  document.getElementById('drawer-sector-name').textContent=row.dataset.sector;drawer.hidden=false;
  requestAnimationFrame(()=>renderCandleChart(document.getElementById('sector-candle-chart'),16,'up'));
}));
document.getElementById('close-sector').addEventListener('click',()=>drawer.hidden=true);
drawer.addEventListener('mousedown',e=>{if(e.target===drawer)drawer.hidden=true});

document.getElementById('parse-conditions').addEventListener('click',()=>openModal('condition-modal'));
document.getElementById('confirm-conditions').addEventListener('click',()=>{closeModal('condition-modal');toast('条件已确认，筛选完成：命中 18 只股票')});
['run-screen','run-screen-top'].forEach(id=>document.getElementById(id).addEventListener('click',()=>toast('筛选完成：命中 18 只股票 · 用时 0.82 秒')));
document.getElementById('record-trade').addEventListener('click',()=>openModal('trade-modal'));
document.getElementById('save-trade').addEventListener('click',()=>{closeModal('trade-modal');toast('原型演示：交易记录已保存，收益将自动重算')});
const checks=[...document.querySelectorAll('.results-table input[type="checkbox"]')];
checks.forEach(input=>input.addEventListener('change',()=>{const count=checks.filter(c=>c.checked).length;document.querySelector('.batch-bar>span').innerHTML=`已选择 <b>${count}</b> 只`}));
document.querySelectorAll('.research-list-item').forEach(item=>item.addEventListener('click',()=>{document.querySelectorAll('.research-list-item').forEach(el=>el.classList.remove('active'));item.classList.add('active');toast(`已打开 ${item.querySelector('strong').textContent} 的研究档案`)}));

function seededRandom(seed){let s=seed%2147483647;return()=>{s=s*16807%2147483647;return(s-1)/2147483646}}
function renderSparklines(){document.querySelectorAll('[data-spark]').forEach(el=>{
  const values=el.dataset.spark.split(',').map(Number);const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  const pts=values.map((v,i)=>`${(i/(values.length-1)*100).toFixed(1)},${(31-(v-min)/range*26).toFixed(1)}`).join(' ');
  const color=el.classList.contains('down-line')?'var(--down)':'var(--up)';
  const id=`spark-${Math.random().toString(36).slice(2,8)}`;
  el.innerHTML=`<svg viewBox="0 0 100 34" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="0,34 ${pts} 100,34" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
})}
function linePath(values,width,height,pad=4){const min=Math.min(...values),max=Math.max(...values),range=max-min||1;return values.map((v,i)=>`${i?'L':'M'} ${(i/(values.length-1)*width).toFixed(1)} ${(height-pad-(v-min)/range*(height-pad*2)).toFixed(1)}`).join(' ')}
function renderAmountChart(){
  const el=document.getElementById('amount-chart');if(!el||!el.clientWidth)return;const w=el.clientWidth,h=el.clientHeight;
  const current=[3,5,7,8,12,15,18,21,25,29,34,37,42,46,50,55,60,66,72,78,83,89,95],previous=[3,4,6,8,10,12,15,18,20,23,27,30,34,37,41,44,48,52,57,61,65,70,74];
  const p1=linePath(current,w-8,h-4,4),p2=linePath(previous,w-8,h-4,4);
  el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="amount-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".17"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><path d="${p2}" fill="none" stroke="var(--faint)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><path d="${p1} L ${w-8} ${h} L 0 ${h} Z" fill="url(#amount-fill)"/><path d="${p1}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${w-8}" cy="${p1.match(/([\d.]+)\s+([\d.]+)$/)?.[2]||10}" r="2.5" fill="var(--accent)"/></svg>`;
}
function renderPerformanceChart(){
  const el=document.getElementById('performance-chart');if(!el||!el.clientWidth)return;const w=el.clientWidth,h=el.clientHeight,right=44,bottom=20,top=12,cw=w-right-8,ch=h-bottom-top;
  const account=[1,1.01,.99,1.02,1.04,1.03,1.07,1.09,1.08,1.1,1.12,1.1,1.09,1.13,1.15,1.14,1.17,1.16,1.19,1.21,1.2,1.24,1.26,1.25,1.29,1.27,1.3,1.32,1.31,1.35,1.34,1.38,1.4,1.38,1.42,1.45,1.43,1.47,1.5,1.48,1.52,1.55,1.54,1.58,1.56,1.6,1.63,1.65];
  let benchmark=[1,1.01,1,1.02,1.01,1.03,1.04,1.03,1.05,1.04,1.06,1.05,1.04,1.06,1.07,1.06,1.08,1.07,1.09,1.08,1.1,1.09,1.11,1.12,1.1,1.12,1.13,1.12,1.14,1.15,1.14,1.16,1.17,1.16,1.18,1.17,1.19,1.18,1.2,1.21,1.2,1.22,1.23,1.22,1.24,1.25,1.26];
  for(let i=0;i<account.length;i++)account[i]=1+(account[i]-1)*(.1842/.65);
  benchmark=benchmark.map(v=>1+(v-1)*(.0926/.26));
  const min=.98,max=1.20;const y=v=>top+(max-v)/(max-min)*ch;const pts=arr=>arr.map((v,i)=>`${i?'L':'M'} ${(8+i/(arr.length-1)*cw).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  let svg=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".16"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  [1,1.05,1.10,1.15,1.20].forEach(v=>{svg+=`<line x1="8" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" class="chart-grid-line"/><text x="${w-right+7}" y="${y(v)+3}" class="chart-axis-text">${v.toFixed(2)}</text>`});
  ['2025/11','2026/01','2026/03','2026/05','2026/07','2026/09','2026/11'].forEach((label,i)=>{svg+=`<text x="${8+i/6*cw}" y="${h-4}" text-anchor="${i===0?'start':i===6?'end':'middle'}" class="chart-axis-text">${label}</text>`});
  const path=pts(account);svg+=`<path d="${path} L ${8+cw} ${top+ch} L 8 ${top+ch} Z" fill="url(#perf-fill)"/><path d="${pts(benchmark)}" fill="none" stroke="var(--blue)" stroke-width="1.2" vector-effect="non-scaling-stroke"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="1.8" vector-effect="non-scaling-stroke"/><circle cx="${8+cw}" cy="${y(account.at(-1))}" r="3" fill="var(--accent)"/><text x="${8+cw-4}" y="${y(account.at(-1))-9}" text-anchor="end" fill="var(--accent)" font-size="9">1.1842</text></svg>`;
  el.innerHTML=svg;
}
function renderCandleChart(el,seed=8,direction='up'){
  if(!el||!el.clientWidth)return;const w=el.clientWidth,h=el.clientHeight,rand=seededRandom(seed+13);const left=10,right=57,top=12,priceH=Math.floor(h*.65),volTop=priceH+26,volH=h-volTop-20,cw=w-left-right;
  const count=Math.max(36,Math.min(68,Math.floor(cw/10)));let base=100+rand()*30;const candles=[];
  for(let i=0;i<count;i++){const drift=direction==='up'?.48:-.28;const open=base+(rand()-.5)*3.5;const close=open+(rand()-.48)*5+drift;const high=Math.max(open,close)+rand()*3.2;const low=Math.min(open,close)-rand()*3.2;const volume=25+rand()*75+(i>count-8?rand()*55:0);candles.push({open,close,high,low,volume});base=close}
  const target=el.id==='main-candle-chart'?Number(stocks[activeStock].price.replace(/,/g,'')):el._targetPrice;
  if(target){const scale=target/candles.at(-1).close;candles.forEach(c=>{c.open*=scale;c.close*=scale;c.high*=scale;c.low*=scale})}
  const high=Math.max(...candles.map(c=>c.high)),low=Math.min(...candles.map(c=>c.low)),maxVol=Math.max(...candles.map(c=>c.volume));const y=p=>top+(high-p)/(high-low)*(priceH-top);const step=cw/count,bodyW=Math.max(3,Math.min(7,step*.58));
  el._chartData={candles,left,right,top,priceH,volTop,volH,cw,count,step,high,low,maxVol,width:w,height:h};el._viewBox={x:0,y:0,w,h};
  let svg=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
  for(let i=0;i<=4;i++){const value=high-(high-low)*i/4,yy=top+(priceH-top)*i/4;svg+=`<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" class="chart-grid-line"/><text x="${w-right+7}" y="${yy+3}" class="chart-axis-text">${value.toFixed(2)}</text>`}
  svg+=`<line x1="${left}" y1="${volTop-10}" x2="${w-right}" y2="${volTop-10}" class="chart-grid-line"/><text x="${left+3}" y="${volTop-15}" class="chart-axis-text">成交量</text><text x="${w-right+7}" y="${volTop+4}" class="chart-axis-text">${(maxVol/10).toFixed(1)}万</text>`;
  const maxIndex=candles.findIndex(c=>c.high===high),minIndex=candles.findIndex(c=>c.low===low),maxVolIndex=candles.findIndex(c=>c.volume===maxVol);
  candles.forEach((c,i)=>{const x=left+i*step+step/2,up=c.close>=c.open,color=up?'var(--up)':'var(--down)';const bodyY=Math.min(y(c.open),y(c.close)),bodyH=Math.max(1.3,Math.abs(y(c.open)-y(c.close)));const vh=c.volume/maxVol*volH;
    svg+=`<line x1="${x}" y1="${y(c.high)}" x2="${x}" y2="${y(c.low)}" stroke="${color}" stroke-width="1"/><rect x="${x-bodyW/2}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${up?'transparent':color}" stroke="${color}" stroke-width="1"/><rect x="${x-bodyW/2}" y="${volTop+volH-vh}" width="${bodyW}" height="${vh}" fill="${color}" opacity=".72"/>`;
    if(i===maxIndex)svg+=`<text x="${Math.min(x+5,w-right-45)}" y="${Math.max(9,y(c.high)-4)}" fill="var(--muted)" font-size="8">最高 ${c.high.toFixed(2)}</text>`;
    if(i===minIndex)svg+=`<text x="${Math.min(x+5,w-right-45)}" y="${Math.min(priceH-3,y(c.low)+10)}" fill="var(--muted)" font-size="8">最低 ${c.low.toFixed(2)}</text>`;
    if(i===maxVolIndex)svg+=`<text x="${Math.min(x+4,w-right-36)}" y="${volTop+volH-vh-4}" fill="var(--muted)" font-size="7">最大量</text>`;
  });
  const last=candles.at(-1),lastY=y(last.close);svg+=`<line x1="${left}" y1="${lastY}" x2="${w-right}" y2="${lastY}" class="chart-last-line"/><rect x="${w-right+2}" y="${lastY-7}" width="49" height="14" rx="2" fill="var(--up)"/><text x="${w-right+26}" y="${lastY+3}" text-anchor="middle" fill="#fff" font-size="8">${last.close.toFixed(2)}</text>`;
  ['06/12','07/10','08/07','09/04','10/09','11/10'].forEach((label,i)=>{svg+=`<text x="${left+i/5*cw}" y="${h-4}" text-anchor="${i===0?'start':i===5?'end':'middle'}" class="chart-axis-text">${label}</text>`});
  const crossX=left+cw*.68,candle=candles[Math.floor(count*.68)];svg+=`<line x1="${crossX}" y1="${top}" x2="${crossX}" y2="${volTop+volH}" class="chart-crosshair"/><rect x="${left+5}" y="${top+4}" width="190" height="18" rx="3" fill="var(--surface-raised)" stroke="var(--border)"/><text x="${left+12}" y="${top+16}" class="chart-axis-text">10/22　开 ${candle.open.toFixed(2)}　高 ${candle.high.toFixed(2)}　低 ${candle.low.toFixed(2)}　收 ${candle.close.toFixed(2)}</text></svg>`;
  el.innerHTML=svg;
}
function renderAllCharts(){renderSparklines();renderAmountChart();renderPerformanceChart();renderCandleChart(document.getElementById('main-candle-chart'),activeSeed,stocks[activeStock].dir);if(!drawer.hidden)renderCandleChart(document.getElementById('sector-candle-chart'),16,'up')}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderAllCharts,120)});
requestAnimationFrame(renderAllCharts);
