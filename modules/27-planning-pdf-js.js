// Export du planning tel qu'affiché : PDF téléchargé, sans impression ni envoi réseau.
let astrPlanningPdfLibPromise=null;
let astrPlanningPdfBusy=false;

function loadAstrPlanningPdfLib(){
  if(window.PDFLib)return Promise.resolve(window.PDFLib);
  if(astrPlanningPdfLibPromise)return astrPlanningPdfLibPromise;
  astrPlanningPdfLibPromise=new Promise(function(resolve,reject){
    const script=document.createElement('script');
    const url=new URL('vendor/pdf-lib-1.17.1.min.js',document.baseURI);
    url.searchParams.set('v',APP_VERSION);
    script.src=url.href;
    script.onload=function(){window.PDFLib?resolve(window.PDFLib):reject(new Error('Bibliothèque PDF indisponible'));};
    script.onerror=function(){script.remove();reject(new Error('Chargement local du PDF impossible'));};
    document.head.appendChild(script);
  }).catch(function(error){astrPlanningPdfLibPromise=null;throw error;});
  return astrPlanningPdfLibPromise;
}

function astrPlanningPdfSnapshotDay(day){
  const table=day.querySelector('table');
  const head=table&&table.tHead;
  const body=table&&table.tBodies[0];
  const slotCount=head&&head.rows[0]?head.rows[0].cells.length-2:0;
  if(!body||slotCount<24||slotCount%24!==0)throw new Error('Grille horaire incomplète');
  const styleOf=function(element){return window.getComputedStyle(element);};
  const dayHeading=day.firstElementChild;
  const rows=Array.from(body.rows).map(function(row){
    const cells=Array.from(row.cells);
    const first=cells[0];
    if(!first)return {kind:'separator'};
    if(first.tagName==='TH')return {
      kind:'group',label:first.textContent.trim(),
      bg:styleOf(first).backgroundColor,fg:styleOf(first).color,
      line:styleOf(first).borderLeftColor
    };
    if(first.colSpan>1)return {kind:'separator'};
    if(cells.length!==slotCount+2)throw new Error('Lignes du planning incomplètes');
    return {
      kind:row.style.background?'count':'agent',
      name:first.textContent.trim(),nameBg:styleOf(first).backgroundColor,nameFg:styleOf(first).color,
      role:cells[1].textContent.trim(),roleBg:styleOf(cells[1]).backgroundColor,
      slots:cells.slice(2).map(function(cell){
        const textElement=cell.querySelector('span')||cell;
        return {text:cell.textContent.trim(),bg:styleOf(cell).backgroundColor,fg:styleOf(textElement).color};
      })
    };
  });
  return {
    label:dayHeading.querySelector('span')?.textContent.trim()||dayHeading.textContent.trim(),
    bg:styleOf(dayHeading).backgroundColor,fg:styleOf(dayHeading).color,
    hours:Array.from(head.rows[0].cells).slice(2).map(function(cell){return cell.textContent.trim();}),
    ends:head.rows[1]?Array.from(head.rows[1].cells).slice(2).map(function(cell){return cell.textContent.trim();}):[],
    slotCount:slotCount,rows:rows
  };
}

async function exportAstrPlanningPDF(){
  if(!canExportAstrPlanningPDF()||astrPlanningPdfBusy)return;
  const grid=document.getElementById('astr-planning-grid');
  const days=grid?Array.from(grid.querySelectorAll('.astr-planning-day')):[];
  if(days.length!==7){
    showToast('Le planning complet doit être affiché avant l’export PDF.','error');
    return;
  }
  let snapshots;
  try{snapshots=days.map(astrPlanningPdfSnapshotDay);}
  catch(error){showToast('Le planning affiché est incomplet : PDF non créé.','error');return;}
  const button=document.getElementById('astr-planning-export');
  const originalLabel=button?button.textContent:'';
  astrPlanningPdfBusy=true;
  if(button){button.disabled=true;button.textContent='Création du PDF...';}
  try{
    const lib=await loadAstrPlanningPdfLib();
    const pdf=await lib.PDFDocument.create();
    pdf.setTitle('AGAI - Planning hebdomadaire');
    pdf.setSubject('Planning des astreintes - sept journées');
    const regular=await pdf.embedFont(lib.StandardFonts.Helvetica);
    const bold=await pdf.embedFont(lib.StandardFonts.HelveticaBold);
    const rgb=lib.rgb;
    const dark=rgb(0.10,0.15,0.23),muted=rgb(0.36,0.43,0.52),line=rgb(0.83,0.86,0.90);
    const white=rgb(1,1,1),headerBg=rgb(0.95,0.97,0.99);
    const pdfColor=function(value,fallback){
      const hex=/^#([0-9a-f]{6})$/i.exec(value||'');
      if(hex)return rgb(parseInt(hex[1].slice(0,2),16)/255,parseInt(hex[1].slice(2,4),16)/255,parseInt(hex[1].slice(4,6),16)/255);
      const parts=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i.exec(value||'');
      if(parts&&(!parts[4]||Number(parts[4])>0))return rgb(Number(parts[1])/255,Number(parts[2])/255,Number(parts[3])/255);
      return fallback;
    };
    const pdfText=function(value){
      return String(value??'').replace(/\s+/g,' ').replace(/[\u2010-\u2015\u2212]/g,'-')
        .replace(/œ/g,'oe').replace(/Œ/g,'OE').replace(/\u2026/g,'...')
        .replace(/[^\x20-\x7e\u00a1-\u00ff]/g,'?').trim();
    };
    const weekLabelText=document.getElementById('astr-week-label')?.textContent||'';
    snapshots.forEach(function(day,index){
      const page=pdf.addPage([841.89,595.28]); // A4 paysage, points PDF.
      const pageW=page.getWidth(),pageH=page.getHeight();
      const margin=5*72/25.4; // 5 mm sur les quatre côtés, zone imprimable.
      const contentW=pageW-2*margin;
      const nameW=130,roleW=25,slotW=(contentW-nameW-roleW)/day.slotCount;
      const slotX=margin+nameW+roleW;
      const slotsPerHour=day.slotCount/24;
      const drawBox=function(x,top,width,height,fill,border){
        page.drawRectangle({x:x,y:pageH-top-height,width:width,height:height,
          color:fill,borderColor:border||line,borderWidth:0.25});
      };
      const drawLabel=function(value,x,top,width,height,size,font,color,center){
        let label=pdfText(value);
        if(!label||width<=1)return;
        let actualSize=Math.max(3,Math.min(size,height-1));
        while(actualSize>3&&font.widthOfTextAtSize(label,actualSize)>width-1)actualSize-=0.25;
        if(font.widthOfTextAtSize(label,actualSize)>width-1){
          while(label&&font.widthOfTextAtSize(label+'...',actualSize)>width-1)label=label.slice(0,-1);
          label=label?label+'...':'';
        }
        if(!label)return;
        const textW=font.widthOfTextAtSize(label,actualSize);
        page.drawText(label,{x:x+(center?Math.max(0,(width-textW)/2):0),
          y:pageH-top-(height+actualSize)/2+1,size:actualSize,font:font,color:color});
      };
      const titleTop=margin,dayTop=margin+16;
      drawLabel('AGAI - Planning des astreintes',margin+2,titleTop,contentW*0.65,14,11,bold,dark,false);
      drawLabel(weekLabelText,margin+contentW*0.65,titleTop,contentW*0.35-2,14,8,regular,muted,true);
      drawBox(margin,dayTop,contentW,17,pdfColor(day.bg,headerBg),line);
      drawLabel(day.label,margin+6,dayTop,contentW-12,17,11,bold,pdfColor(day.fg,dark),false);
      const headerTop=margin+36,firstHeaderH=10,secondHeaderH=8,bodyTop=headerTop+firstHeaderH+secondHeaderH;
      drawBox(margin,headerTop,nameW,firstHeaderH+secondHeaderH,headerBg,line);
      drawBox(margin+nameW,headerTop,roleW,firstHeaderH+secondHeaderH,headerBg,line);
      drawLabel('Grade Nom Prénom',margin+3,headerTop,nameW-6,firstHeaderH+secondHeaderH,8,bold,dark,false);
      drawLabel('Fct',margin+nameW,headerTop,roleW,firstHeaderH+secondHeaderH,7,bold,dark,true);
      for(let hour=0;hour<24;hour++){
        const from=hour*slotsPerHour,to=from+slotsPerHour-1;
        const x=slotX+from*slotW,width=slotsPerHour*slotW;
        drawBox(x,headerTop,width,firstHeaderH,headerBg,line);
        drawBox(x,headerTop+firstHeaderH,width,secondHeaderH,headerBg,line);
        drawLabel(day.hours[from],x,headerTop,width,firstHeaderH,7,bold,dark,true);
        drawLabel(day.ends[to]||'',x,headerTop+firstHeaderH,width,secondHeaderH,6.5,regular,muted,true);
      }
      const rowWeight=function(row){return row.kind==='group'?14:row.kind==='separator'?3:row.kind==='count'?10:12;};
      const totalWeight=day.rows.reduce(function(sum,row){return sum+rowWeight(row);},0);
      const availableH=pageH-margin-25-bodyTop;
      const factor=Math.min(1,availableH/Math.max(1,totalWeight));
      let top=bodyTop;
      day.rows.forEach(function(row){
        const height=rowWeight(row)*factor;
        if(row.kind==='separator'){
          drawBox(margin,top,contentW,height,line,line);
        } else if(row.kind==='group'){
          drawBox(margin,top,contentW,height,pdfColor(row.bg,headerBg),line);
          drawBox(margin,top,3,height,pdfColor(row.line,muted),pdfColor(row.line,muted));
          drawLabel(row.label,margin+6,top,contentW-9,height,Math.min(8.5,height-1),bold,pdfColor(row.fg,dark),false);
        } else {
          const count=row.kind==='count';
          drawBox(margin,top,nameW,height,pdfColor(row.nameBg,count?headerBg:white),line);
          drawBox(margin+nameW,top,roleW,height,pdfColor(row.roleBg,count?headerBg:white),line);
          drawLabel(row.name,margin+3,top,nameW-6,height,Math.min(8,height-1),count?bold:regular,pdfColor(row.nameFg,dark),false);
          if(row.role)drawLabel(row.role,margin+nameW,top,roleW,height,Math.min(7,height-1),regular,muted,true);
          row.slots.forEach(function(cell,slot){
            const x=slotX+slot*slotW;
            drawBox(x,top,slotW,height,pdfColor(cell.bg,count?headerBg:white),line);
            if(cell.text)drawLabel(cell.text,x+0.3,top,slotW-0.6,height,
              Math.min(count?6:7,height-1),count?bold:regular,pdfColor(cell.fg,dark),true);
          });
        }
        top+=height;
      });
      drawLabel('Vert : disponible   |   Vert clair + X : piquet   |   Rouge : indisponible   |   Gris : absence   |   FOR : formation',
        margin+2,pageH-margin-20,contentW-4,10,6.5,regular,muted,false);
      drawLabel('Page '+(index+1)+' / 7 - Vue affichée au moment de l\'export',
        margin+contentW*0.60,pageH-margin-10,contentW*0.40-2,9,6.5,regular,muted,true);
    });
    if(pdf.getPageCount()!==7)throw new Error('Nombre de pages incorrect');
    const bytes=await pdf.save();
    const blob=new Blob([bytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    const monday=getMondayOfWeek(astrPlanningWeek);
    const station=String(CURRENT_CASERNE_ID||'caserne').replace(/[^a-zA-Z0-9_-]/g,'');
    link.href=url;
    link.download='AGAI-planning-'+station+'-'+weekKey(monday)+'.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function(){URL.revokeObjectURL(url);},60000);
    showToast('Planning PDF téléchargé.','success');
  }catch(error){
    console.error('Export planning PDF',error);
    showToast('Impossible de créer le PDF sur cet appareil. Aucune donnée modifiée.','error');
  }finally{
    astrPlanningPdfBusy=false;
    if(button){button.disabled=false;button.textContent=originalLabel;}
  }
}
