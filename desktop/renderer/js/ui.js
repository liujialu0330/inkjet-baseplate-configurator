export const C = { muted:'var(--muted)', red:'var(--red)', green:'var(--green)', orange:'#e67e00' };
export function setMsg(text, color){ const m=document.getElementById('msg'); if(m){ m.textContent=text; m.style.color=color; } }
