const icon=(name:string,size=17)=>{
 const paths:Record<string,string>={
  deliverable:'<rect x="2" y="3" width="20" height="5" rx="1.5"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="m8 14 3 3 5-5"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 21v-3a6 6 0 0 0-2-4.5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',back:'<path d="M19 12H5m7 7-7-7 7-7"/>',
  check:'<path d="m5 12 4 4L19 6"/>',x:'<path d="M6 6l12 12M18 6 6 18"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  chart:'<path d="M4 20V5M4 20h17M8 16l4-5 4 2 4-7"/>',
  external:'<path d="M13 5h6v6M19 5l-9 9M19 13v6H5V5h6"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  columns:'<path d="M3 4h8v16H3zM13 4h8v16h-8z"/>',
  sort:'<path d="m4 7 4-4 4 4M8 3v18M20 17l-4 4-4-4m0 4V3"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  link:'<path d="M10 13a5 5 0 0 0 7 .3l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7-.3l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  expand:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  folder:'<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/><path d="M2 10h20"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m12 2 2 3 4-1 1 4 3 2-2 4 1 4-4 1-2 3-3-2-4 1-1-4-3-2 2-4-1-4 4-1z"/>',
  dot:'<circle cx="12" cy="12" r="4"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'
 };
 return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.dot}</svg>`;
};
