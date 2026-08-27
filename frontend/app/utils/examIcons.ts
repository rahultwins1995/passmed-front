// Category / exam-type → SVG path content (inner of the <svg>, stroke/fill applied
// by the caller). Keys are lowercase, spaces/slashes → '-', '&' → 'and'.
//
// This is a broad, self-contained icon library (Feather/Lucide-style, 24×24,
// stroke-based) so the admin icon picker can offer many choices WITHOUT anyone
// ever needing to upload or add new icon files. Keep this map and the admin
// mirror (chandan-passmed-admin: app/utils/examIcons.ts) in sync.

const ICONS: Record<string, string> = {
  // ── Medical specialties (also used as category-name fallbacks) ──────────────
  'internal-medicine': '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M4 3h4M12 3h4"/><path d="M10 13v3a4 4 0 0 0 8 0v-1"/><circle cx="18" cy="13" r="2"/>',
  'surgery': '<path d="M21 4 13 12l-3-3 8-8h3v3z"/><path d="M11 11 3 19v2h2l8-8"/>',
  'general-practice': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'family-medicine': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'emergency-medicine': '<path d="M2 12h3.5l2-5 3 10 2-6 1.5 3H22"/>',
  'anesthesiology': '<line x1="2" y1="9" x2="2" y2="15"/><line x1="2" y1="12" x2="4" y2="12"/><rect x="4" y="10" width="11" height="4"/><line x1="6.5" y1="10" x2="6.5" y2="12"/><line x1="9" y1="10" x2="9" y2="12"/><line x1="11.5" y1="10" x2="11.5" y2="12"/><path d="M15 11h2v2h-2z"/><line x1="17" y1="12" x2="22" y2="12"/>',
  'anesthesia': '<line x1="2" y1="9" x2="2" y2="15"/><line x1="2" y1="12" x2="4" y2="12"/><rect x="4" y="10" width="11" height="4"/><line x1="6.5" y1="10" x2="6.5" y2="12"/><line x1="9" y1="10" x2="9" y2="12"/><line x1="11.5" y1="10" x2="11.5" y2="12"/><path d="M15 11h2v2h-2z"/><line x1="17" y1="12" x2="22" y2="12"/>',
  'psychiatry': '<path d="M9.5 2a2.5 2.5 0 0 1 2.5 2.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/><path d="M14.5 2a2.5 2.5 0 0 0-2.5 2.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/>',
  'neurology': '<path d="M9.5 2a2.5 2.5 0 0 1 2.5 2.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/><path d="M14.5 2a2.5 2.5 0 0 0-2.5 2.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/>',
  'brain': '<path d="M9.5 2a2.5 2.5 0 0 1 2.5 2.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/><path d="M14.5 2a2.5 2.5 0 0 0-2.5 2.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/>',
  'obstetrics-and-gynecology': '<path d="M9 8.5c0 4 1.2 8 3 8s3-4 3-8"/><path d="M12 16.5V21"/><path d="M9.5 21h5"/><path d="M9 8.5c-.5-2-1.7-3.2-3.7-3.6"/><path d="M15 8.5c.5-2 1.7-3.2 3.7-3.6"/><circle cx="5" cy="4.5" r="1.5"/><circle cx="19" cy="4.5" r="1.5"/>',
  'obstetrics-and-gynaecology': '<path d="M9 8.5c0 4 1.2 8 3 8s3-4 3-8"/><path d="M12 16.5V21"/><path d="M9.5 21h5"/><path d="M9 8.5c-.5-2-1.7-3.2-3.7-3.6"/><path d="M15 8.5c.5-2 1.7-3.2 3.7-3.6"/><circle cx="5" cy="4.5" r="1.5"/><circle cx="19" cy="4.5" r="1.5"/>',
  'ob-gyn': '<path d="M9 8.5c0 4 1.2 8 3 8s3-4 3-8"/><path d="M12 16.5V21"/><path d="M9.5 21h5"/><path d="M9 8.5c-.5-2-1.7-3.2-3.7-3.6"/><path d="M15 8.5c.5-2 1.7-3.2 3.7-3.6"/><circle cx="5" cy="4.5" r="1.5"/><circle cx="19" cy="4.5" r="1.5"/>',
  'pediatrics': '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="14" r="7"/><circle cx="9.5" cy="13" r="0.6" fill="currentColor"/><circle cx="14.5" cy="13" r="0.6" fill="currentColor"/><path d="M10.5 16.5h3"/>',
  'paediatrics': '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="14" r="7"/><circle cx="9.5" cy="13" r="0.6" fill="currentColor"/><circle cx="14.5" cy="13" r="0.6" fill="currentColor"/><path d="M10.5 16.5h3"/>',
  'ophthalmology': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'dentistry': '<path d="M7 2c-1.5 0-3 1-3 3v3c0 6 2 13 5 13 1 0 1-2 2-5 0-1 1-1 2-1s2 0 2 1c1 3 1 5 2 5 3 0 5-7 5-13V5c0-2-1.5-3-3-3-2 0-3 1-5 1s-3-1-7-1z"/>',
  'cardiology': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/><path d="M3.5 12h4l2-4 3 8 2-4h4.5"/>',
  'dermatology': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  'orthopedics': '<path d="M17 10c1.5-1 2-2.5 2-4a3 3 0 0 0-6 0c0 1-.5 1.7-1.2 2.2L9 10"/><path d="M7 14c-1.5 1-2 2.5-2 4a3 3 0 0 0 6 0c0-1 .5-1.7 1.2-2.2L15 14"/><line x1="9" y1="10" x2="15" y2="14"/>',
  'pathology': '<path d="M6 3h12"/><path d="M9 3v6l-3.5 8.5A2 2 0 0 0 7.4 20h9.2a2 2 0 0 0 1.9-2.5L15 9V3"/><line x1="7" y1="14" x2="17" y2="14"/>',
  'radiology': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"/>',
  'oncology': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  'pharmacy': '<path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/>',
  'medical-school': '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  'medical-students': '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  'graduation-cap': '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',

  // ── Medical / health generics ───────────────────────────────────────────────
  'stethoscope': '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
  'heart': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  'pulse': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'activity': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'pill': '<path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/>',
  'thermometer': '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  'droplet': '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'plus-cross': '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  'shield-plus': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/>',

  // ── Study / education / documents ───────────────────────────────────────────
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'clipboard': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  'edit': '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  'bookmark': '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  'award': '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',

  // ── Time / progress / data ──────────────────────────────────────────────────
  'clock': '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  'calendar': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  'pie-chart': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'layers': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'grid': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',

  // ── People / places / misc ──────────────────────────────────────────────────
  'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'users': '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'home': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'building': '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="2"/><line x1="15" y1="22" x2="15" y2="2"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'map-pin': '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  'compass': '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'monitor': '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  'search': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
}

// Default: stethoscope (site-wide fallback for unmapped categories).
const DEFAULT_ICON = ICONS['stethoscope']!

/**
 * The admin-facing icon picker options. `key` is stored on the exam record
 * (exams.icon) and passed back to getExamIconPath(). Keep this list and the admin
 * app's mirror (chandan-passmed-admin: app/utils/examIcons.ts) in sync.
 */
export const EXAM_ICON_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'stethoscope',        label: 'Stethoscope' },
  { key: 'heart',              label: 'Heart' },
  { key: 'pulse',              label: 'Pulse / Activity' },
  { key: 'brain',              label: 'Brain' },
  { key: 'pill',               label: 'Pill' },
  { key: 'thermometer',        label: 'Thermometer' },
  { key: 'droplet',            label: 'Droplet' },
  { key: 'eye',                label: 'Eye' },
  { key: 'plus-cross',         label: 'Medical cross' },
  { key: 'shield-plus',        label: 'Health shield' },
  { key: 'internal-medicine',  label: 'Internal Medicine' },
  { key: 'surgery',            label: 'Surgery' },
  { key: 'cardiology',         label: 'Cardiology' },
  { key: 'dermatology',        label: 'Dermatology' },
  { key: 'orthopedics',        label: 'Orthopedics' },
  { key: 'pathology',          label: 'Pathology' },
  { key: 'radiology',          label: 'Radiology' },
  { key: 'oncology',           label: 'Oncology' },
  { key: 'pharmacy',           label: 'Pharmacy' },
  { key: 'general-practice',   label: 'General Practice' },
  { key: 'emergency-medicine', label: 'Emergency Medicine' },
  { key: 'anesthesia',         label: 'Anesthesia' },
  { key: 'psychiatry',         label: 'Psychiatry' },
  { key: 'neurology',          label: 'Neurology' },
  { key: 'ob-gyn',             label: 'OB/GYN' },
  { key: 'pediatrics',         label: 'Pediatrics' },
  { key: 'ophthalmology',      label: 'Ophthalmology' },
  { key: 'dentistry',          label: 'Dentistry' },
  { key: 'graduation-cap',     label: 'Graduation cap' },
  { key: 'book',               label: 'Book' },
  { key: 'book-open',          label: 'Book (open)' },
  { key: 'clipboard',          label: 'Clipboard' },
  { key: 'file-text',          label: 'Document' },
  { key: 'edit',               label: 'Edit / Notes' },
  { key: 'bookmark',           label: 'Bookmark' },
  { key: 'award',              label: 'Award' },
  { key: 'star',               label: 'Star' },
  { key: 'target',             label: 'Target' },
  { key: 'flag',               label: 'Flag' },
  { key: 'clock',              label: 'Clock' },
  { key: 'calendar',           label: 'Calendar' },
  { key: 'trending-up',        label: 'Trending up' },
  { key: 'bar-chart',          label: 'Bar chart' },
  { key: 'pie-chart',          label: 'Pie chart' },
  { key: 'zap',                label: 'Bolt' },
  { key: 'check-circle',       label: 'Check' },
  { key: 'layers',             label: 'Layers' },
  { key: 'grid',               label: 'Grid' },
  { key: 'user',               label: 'User' },
  { key: 'users',              label: 'Group' },
  { key: 'home',               label: 'Home' },
  { key: 'building',           label: 'Building' },
  { key: 'globe',              label: 'Globe' },
  { key: 'map-pin',            label: 'Location' },
  { key: 'compass',            label: 'Compass' },
  { key: 'briefcase',          label: 'Briefcase' },
  { key: 'monitor',            label: 'Monitor' },
  { key: 'search',             label: 'Search' },
  { key: 'settings',           label: 'Settings' },
  { key: 'shield',             label: 'Shield' },
]

/** Look up the SVG path content for an icon key OR a category name. Returns the
 *  default stethoscope if there is no match. */
export function getExamIconPath(category: string | undefined | null): string {
  if (!category) return DEFAULT_ICON
  const key = String(category)
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return ICONS[key] || DEFAULT_ICON
}
