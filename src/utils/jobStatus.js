// Display metadata for the triage status of a job (backend field `status`).
// Pure data: no state, no API access. Order = pipeline order.

export const JOB_STATUSES = ['new', 'interested', 'applied', 'discarded']

// Status every job starts with; toggling an active action off returns here.
export const DEFAULT_STATUS = 'new'

// Statuses with an explicit user action (StatusActions buttons).
export const ACTION_STATUSES = ['interested', 'applied', 'discarded']

// badge: state of the offer (row chip, filter); action: first-person button label;
// filter: plural chip label; shortcut: proposed single-key shortcut (list focus only).
export const STATUS_META = {
  new: { badge: 'Pendiente', filter: 'Pendientes', action: null, shortcut: null },
  interested: { badge: 'Me interesa', filter: 'Me interesa', action: 'Me interesa', shortcut: 'i' },
  applied: { badge: 'Postulada', filter: 'Postuladas', action: 'Postulé', shortcut: 'a' },
  discarded: { badge: 'Descartada', filter: 'Descartadas', action: 'Descartar', shortcut: 'x' },
}

// Tone per status. Color is never the only signal: every use pairs it with an icon and text.
export const STATUS_TONE_CLASS = {
  new: 'border-border text-text-muted',
  interested: 'border-accent/40 bg-accent/10 text-accent',
  applied: 'border-success/40 bg-success/10 text-success',
  discarded: 'border-border bg-surface-2 text-text-muted',
}

export const isKnownStatus = (status) => JOB_STATUSES.includes(status)
