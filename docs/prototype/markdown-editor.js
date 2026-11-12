function editorEscape(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function inlineToMarkdown(node){
  if(node.nodeType===Node.TEXT_NODE)return node.textContent;
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const content=[...node.childNodes].map(inlineToMarkdown).join('');
  if(['STRONG','B'].includes(node.tagName))return`**${content}**`;
  if(['EM','I'].includes(node.tagName))return`*${content}*`;
  if(node.tagName==='CODE')return`\`${content}\``;
  if(node.tagName==='BR')return'\n';
  if(node.tagName==='A')return`[${content}](${node.getAttribute('href')||''})`;
  return content;
}
function blockToMarkdown(node){
  if(node.nodeType===Node.TEXT_NODE)return node.textContent.trim()?node.textContent.trim():'';
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  if(/^H[1-6]$/.test(node.tagName)){const level=Number(node.tagName[1]);return`${'#'.repeat(level)} ${inlineToMarkdown(node).trim()}`}
  if(node.tagName==='P')return inlineToMarkdown(node).trim();
  if(node.tagName==='UL')return[...node.children].map(li=>`- ${inlineToMarkdown(li).trim()}`).join('\n');
  if(node.tagName==='OL')return[...node.children].map((li,i)=>`${i+1}. ${inlineToMarkdown(li).trim()}`).join('\n');
  if(node.tagName==='TABLE'){
    const rows=$$('tr',node).map(row=>$$('th,td',row).map(cell=>inlineToMarkdown(cell).trim().replace(/\|/g,'\\|')));if(!rows.length)return '';
    return`| ${rows[0].join(' | ')} |\n| ${rows[0].map(()=> '---').join(' | ')} |\n${rows.slice(1).map(row=>`| ${row.join(' | ')} |`).join('\n')}`;
  }
  if(node.tagName==='BLOCKQUOTE')return`> ${inlineToMarkdown(node).trim()}`;
  if(node.tagName==='HR')return'---';
  return[...node.childNodes].map(blockToMarkdown).filter(Boolean).join('\n\n');
}
function htmlToMarkdown(html){const template=document.createElement('template');template.innerHTML=html;return[...template.content.childNodes].map(blockToMarkdown).filter(Boolean).join('\n\n').replace(/\n{3,}/g,'\n\n')}
function inlineMarkdown(value){
  let text=editorEscape(value);
  const code=[];text=text.replace(/`([^`]+)`/g,(_,content)=>{code.push(content);return`\u0000${code.length-1}\u0000`});
  text=text.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g,(_,alt,url)=>/^(https?:\/\/|\.\/|\/)/.test(url)?`<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:6px"/>`:alt);
  text=text.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g,(_,label,url)=>/^(https?:\/\/|#|\.\/|\/)/.test(url)?`<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`:label);
  text=text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/~~([^~]+)~~/g,'<del>$1</del>');
  text=text.replace(/\u0000(\d+)\u0000/g,(_,index)=>`<code>${code[Number(index)]}</code>`);
  return text;
}
function markdownToHtml(markdown){
  const lines=markdown.replace(/\r/g,'').split('\n');let html='',i=0;
  while(i<lines.length){
    const line=lines[i].trim();if(!line){i++;continue}
    if(line.startsWith('```')){const code=[];i++;while(i<lines.length&&!lines[i].trim().startsWith('```')){code.push(lines[i]);i++}i++;html+=`<pre><code>${editorEscape(code.join('\n'))}</code></pre>`;continue}
    const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){const level=heading[1].length;html+=`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;i++;continue}
    if(line.startsWith('|')&&i+1<lines.length&&/^\|?[\s:|-]+\|?$/.test(lines[i+1].trim())&&lines[i+1].includes('-')){
      const parseRow=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());const headers=parseRow(line);i+=2;const rows=[];while(i<lines.length&&lines[i].trim().startsWith('|')){rows.push(parseRow(lines[i]));i++}html+=`<table><thead><tr>${headers.map(cell=>`<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;continue
    }
    if(/^[-*]\s+/.test(line)){const items=[];while(i<lines.length&&/^[-*]\s+/.test(lines[i].trim())){items.push(lines[i].trim().replace(/^[-*]\s+/,''));i++}html+=`<ul>${items.map(item=>`<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`;continue}
    if(/^\d+\.\s+/.test(line)){const items=[];while(i<lines.length&&/^\d+\.\s+/.test(lines[i].trim())){items.push(lines[i].trim().replace(/^\d+\.\s+/,''));i++}html+=`<ol>${items.map(item=>`<li>${inlineMarkdown(item)}</li>`).join('')}</ol>`;continue}
    if(/^>\s?/.test(line)){const quote=[];while(i<lines.length&&/^>\s?/.test(lines[i].trim())){quote.push(lines[i].trim().replace(/^>\s?/,''));i++}html+=`<blockquote>${quote.map(item=>`<p>${inlineMarkdown(item)}</p>`).join('')}</blockquote>`;continue}
    if(/^(---|\*\*\*)$/.test(line)){html+='<hr/>';i++;continue}
    const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s?|```|\|)/.test(lines[i].trim())){paragraph.push(lines[i].trim());i++}html+=`<p>${inlineMarkdown(paragraph.join(' '))}</p>`;
  }
  return html||'<p class="studio-empty-preview">开始输入 Markdown，预览会显示在这里。</p>';
}
let activeStudio=null;
function openMarkdownStudio(){
  if(activeStudio)return;
  const name=currentResearch,doc=researchDocs[name],initialMarkdown=htmlToMarkdown(doc.body);
  const studio=document.createElement('div');studio.className='markdown-studio';studio.innerHTML=`
    <header class="studio-header">
      <button class="studio-back" id="studio-back"><i data-icon="arrow-right"></i>返回研究库</button>
      <div class="studio-document"><input id="studio-title" value="${editorEscape(name)} · 研究档案" aria-label="研究档案标题"/><span>${editorEscape(doc.code)}</span></div>
      <span class="studio-save-state" id="studio-save-state">所有更改已保存</span>
      <div class="studio-header-actions"><button class="button compact ghost" id="studio-export"><i data-icon="download"></i>导出</button><button class="button compact primary" id="studio-done"><i data-icon="check"></i>完成</button></div>
      <div class="studio-export-menu" id="studio-export-menu" hidden><button id="studio-export-md"><i data-icon="file"></i>Markdown 文件</button><button id="studio-export-html"><i data-icon="file"></i>HTML 文件</button></div>
    </header>
    <div class="studio-modebar">
      <button class="studio-outline-toggle" id="studio-outline-toggle"><i data-icon="layout"></i>大纲</button>
      <div class="studio-mode-tabs"><button class="active" data-studio-mode="edit">写作</button><button data-studio-mode="preview">预览</button><button data-studio-mode="split">分屏</button></div>
      <button class="studio-focus-button" id="studio-focus"><i data-icon="expand"></i>专注模式</button>
    </div>
    <div class="studio-workspace">
      <aside class="studio-outline" id="studio-outline"><h3>文档大纲</h3><div id="studio-outline-items"></div></aside>
      <div class="studio-editor-column">
        <div class="studio-toolbar" aria-label="Markdown 格式化工具栏">
          <button class="studio-tool" data-md="h2" title="二级标题">H2</button><button class="studio-tool" data-md="h3" title="三级标题">H3</button><span class="studio-tool-separator"></span>
          <button class="studio-tool" data-md="bold" title="加粗 Cmd/Ctrl+B"><strong>B</strong></button><button class="studio-tool" data-md="italic" title="斜体"><em>I</em></button><button class="studio-tool" data-md="strike" title="删除线"><del>S</del></button><button class="studio-tool" data-md="code" title="行内代码">&lt;/&gt;</button><span class="studio-tool-separator"></span>
          <button class="studio-tool" data-md="list" title="无序列表">• 列表</button><button class="studio-tool" data-md="ordered" title="有序列表">1. 列表</button><button class="studio-tool" data-md="quote" title="引用">“ ”</button><span class="studio-tool-separator"></span>
          <button class="studio-tool" data-md="link" title="链接">链接</button><button class="studio-tool" data-md="table" title="插入表格">表格</button><button class="studio-tool" data-md="image" title="图片">图片</button>
        </div>
        <div class="studio-editor-stage" id="studio-stage" data-mode="edit">
          <div class="studio-source-pane"><textarea class="studio-source" id="studio-source" aria-label="Markdown 研究正文" spellcheck="false" placeholder="# 开始记录你的研究……"></textarea></div>
          <div class="studio-preview-pane"><article class="markdown-preview" id="studio-preview"></article></div>
        </div>
      </div>
    </div>
    <footer class="studio-footer"><span id="studio-word-count">0 字</span><span>Markdown</span><span>自动保存到研究档案</span><span><kbd>⌘/Ctrl S</kbd> 保存　<kbd>⌘/Ctrl B</kbd> 加粗</span></footer>`;
  document.body.appendChild(studio);hydrateIcons(studio);activeStudio=studio;document.body.style.overflow='hidden';
  const source=$('#studio-source',studio),preview=$('#studio-preview',studio),stage=$('#studio-stage',studio),saveState=$('#studio-save-state',studio);source.value=initialMarkdown;let saveTimer;
  function updateOutline(){const headings=[];source.value.split('\n').forEach((line,index)=>{const match=line.match(/^(#{1,3})\s+(.+)/);if(match)headings.push({level:match[1].length,text:match[2],line:index})});const container=$('#studio-outline-items',studio);container.innerHTML=headings.length?headings.map(h=>`<button class="outline-item level-${h.level}" data-line="${h.line}" title="${editorEscape(h.text)}">${editorEscape(h.text)}</button>`).join(''):'<div class="outline-item">暂无标题</div>';$$('.outline-item[data-line]',container).forEach(btn=>btn.addEventListener('click',()=>{const lines=source.value.split('\n'),position=lines.slice(0,Number(btn.dataset.line)).join('\n').length+(Number(btn.dataset.line)?1:0);source.focus();source.setSelectionRange(position,position);if(innerWidth<1000)$('#studio-outline',studio).classList.remove('open')}))}
  function updatePreview(){preview.innerHTML=markdownToHtml(source.value);updateOutline();const count=source.value.replace(/\s/g,'').length;$('#studio-word-count',studio).textContent=`${count.toLocaleString()} 字 · ${source.value.split('\n').length} 行`}
  function saveNow(){clearTimeout(saveTimer);doc.body=markdownToHtml(source.value);renderResearch(name);saveState.textContent='所有更改已保存';saveState.classList.remove('saving');activeStudio?.classList.remove('has-unsaved')}
  function scheduleSave(){saveState.textContent='正在保存…';saveState.classList.add('saving');clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,650);updatePreview()}
  function closeStudio(){saveNow();studio.remove();activeStudio=null;document.body.style.overflow='';document.removeEventListener('keydown',keyboardHandler)}
  function setMode(mode){stage.dataset.mode=mode;$$('[data-studio-mode]',studio).forEach(btn=>btn.classList.toggle('active',btn.dataset.studioMode===mode));updatePreview()}
  function applyFormat(type){
    const start=source.selectionStart,end=source.selectionEnd,selected=source.value.slice(start,end);let before=selected,after='',cursorOffset=0;
    const wrappers={bold:['**','**'],italic:['*','*'],strike:['~~','~~'],code:['`','`']};
    if(wrappers[type]){const[a,b]=wrappers[type];before=`${a}${selected||'文字'}${b}`;cursorOffset=selected?before.length:before.length-b.length}
    else if(['h2','h3','list','ordered','quote'].includes(type)){const prefix={h2:'## ',h3:'### ',list:'- ',ordered:'1. ',quote:'> '}[type];before=selected?selected.split('\n').map(line=>prefix+line).join('\n'):prefix+({h2:'标题',h3:'标题',list:'列表项',ordered:'列表项',quote:'引用内容'}[type]);cursorOffset=before.length}
    else if(type==='link'){before=`[${selected||'链接文字'}](https://)`;cursorOffset=before.length-1}
    else if(type==='image'){before=`![${selected||'图片描述'}](图片地址)`;cursorOffset=before.length-4}
    else if(type==='table'){before=`\n| 观察维度 | 当前判断 | 需要验证 |\n| --- | --- | --- |\n| 项目一 | 待填写 | 待填写 |\n| 项目二 | 待填写 | 待填写 |\n`;cursorOffset=before.length}
    before+=after;source.setRangeText(before,start,end,'end');source.focus();const position=type==='link'?start+cursorOffset:start+cursorOffset;source.setSelectionRange(position,position);scheduleSave()
  }
  function keyboardHandler(e){
    if(!activeStudio)return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveNow();toast('研究正文已保存')}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='b'){e.preventDefault();applyFormat('bold')}
    if(e.key==='Escape'){$('#studio-export-menu',studio).hidden=true;if(studio.classList.contains('focus-writing')){$('#studio-focus',studio).click()}}
  }
  source.addEventListener('input',scheduleSave);
  source.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const start=source.selectionStart;source.setRangeText('  ',start,source.selectionEnd,'end');scheduleSave()}});
  source.addEventListener('scroll',()=>{if(stage.dataset.mode==='split'){const ratio=source.scrollTop/Math.max(1,source.scrollHeight-source.clientHeight);const pane=$('.studio-preview-pane',studio);pane.scrollTop=ratio*(pane.scrollHeight-pane.clientHeight)}});
  $$('[data-studio-mode]',studio).forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.studioMode)));
  $$('[data-md]',studio).forEach(btn=>btn.addEventListener('click',()=>applyFormat(btn.dataset.md)));
  $('#studio-outline-toggle',studio).addEventListener('click',e=>{const open=$('#studio-outline',studio).classList.toggle('open');e.currentTarget.classList.toggle('active',open)});
  $('#studio-focus',studio).addEventListener('click',e=>{const active=studio.classList.toggle('focus-writing');e.currentTarget.classList.toggle('active',active);if(active){stage.dataset.mode='edit';$$('[data-studio-mode]',studio).forEach(btn=>btn.classList.toggle('active',btn.dataset.studioMode==='edit'))}source.focus()});
  $('#studio-export',studio).addEventListener('click',()=>{$('#studio-export-menu',studio).hidden=!$('#studio-export-menu',studio).hidden});
  $('#studio-export-md',studio).addEventListener('click',()=>{downloadText(`${name}-研究档案.md`,source.value,'text/markdown;charset=utf-8');$('#studio-export-menu',studio).hidden=true});
  $('#studio-export-html',studio).addEventListener('click',()=>{downloadText(`${name}-研究档案.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${editorEscape(name)}研究档案</title><body>${markdownToHtml(source.value)}</body></html>`,'text/html;charset=utf-8');$('#studio-export-menu',studio).hidden=true});
  $('#studio-back',studio).addEventListener('click',closeStudio);$('#studio-done',studio).addEventListener('click',()=>{closeStudio();toast('研究正文已保存，旧版本已自动保留')});
  document.addEventListener('keydown',keyboardHandler);updatePreview();source.focus();source.setSelectionRange(0,0);
}
rebind($('.document-head .button.primary'),openMarkdownStudio);
$('.main-nav .nav-count').textContent='18';
$$('.research-state').filter(el=>el.textContent==='待研究').forEach(el=>{el.classList.remove('doing');el.classList.add('todo')});

if(new URLSearchParams(location.search).get('studio')==='1'){switchPage('research');requestAnimationFrame(openMarkdownStudio)}
