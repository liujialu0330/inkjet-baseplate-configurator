// 源: 原 render() 内 306-318 校验段, 抽成纯函数
export function validate(v, emptyReqCount, badSet){
  const r=v.m3_dia/2, holeZ=v.win_H/2-v.m3_inset, subTop=v.sub_H/2;
  const shelfOK=(v.m3_inset>=r)&&(v.m3_inset<=v.shelf_H-r);
  const tabOK=(holeZ+r<=subTop)&&(holeZ-r>=subTop-v.tab_H);
  const probs=[];
  if(emptyReqCount>0) probs.push('必填项未填');
  if(badSet.size>0) probs.push('区域重叠或越界（红框）');
  if(!(shelfOK&&tabOK)) probs.push('固定孔超出台肩/耳，主体与子板孔无法重合贯通');
  const mainBad = emptyReqCount>0 || badSet.size>0;
  return { problems:probs, saveDisabled: probs.length>0, exportDisabled: mainBad };
}
