import React, { useState, useEffect } from 'react'
import { X, Sparkles, Send, CheckCircle2, AlertCircle, Loader2, Mail, ShieldAlert, Check, Copy } from 'lucide-react'

const REGISTRATION_STORAGE_KEY = 'mycinema_ft_test_user_registration'

interface StoredRegistration {
  name: string
  email: string
  submittedAt: string
}

interface RequestTestUserModalProps {
  isOpen: boolean
  onClose: () => void
  initialEmail?: string
}

export const RequestTestUserModal: React.FC<RequestTestUserModalProps> = ({
  isOpen,
  onClose,
  initialEmail = '',
}) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(initialEmail)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [existing, setExisting] = useState<StoredRegistration | null>(null)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSuccess(false)
    try {
      const saved = localStorage.getItem(REGISTRATION_STORAGE_KEY)
      if (saved) {
        const parsed: StoredRegistration = JSON.parse(saved)
        if (parsed.email) {
          setExisting(parsed)
          setName(parsed.name || '')
          setEmail(parsed.email)
          setEditing(false)
          return
        }
      }
    } catch {
      // ignore JSON errors
    }
    setExisting(null)
    setEditing(true)
    if (initialEmail) setEmail(initialEmail)
  }, [isOpen, initialEmail])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, submitting, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedName) {
      setError('Please enter your name.')
      return
    }
    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setError('Please enter a valid Google/YouTube account email address.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await window.api.ftRequestImportAccess({ name: trimmedName, email: trimmedEmail })
      if (res.error) {
        setError(res.error)
        setSubmitting(false)
        return
      }

      const record: StoredRegistration = {
        name: trimmedName,
        email: trimmedEmail,
        submittedAt: new Date().toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      }

      try {
        localStorage.setItem(REGISTRATION_STORAGE_KEY, JSON.stringify(record))
      } catch {}

      setExisting(record)
      setSuccess(true)
      setEditing(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to submit request. Please verify your internet connection.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyEmail = () => {
    const target = existing?.email || email
    if (!target) return
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(target).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-access-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0e1017] shadow-2xl transition-all">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 id="request-access-title" className="text-sm font-black uppercase tracking-wider text-white">
                YouTube Import Access
              </h3>
              <p className="text-[10px] font-bold text-amber-400/80">
                100 Google Test User Program
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {success ? (
            /* Success confirmation */
            <div className="text-center py-3 space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 size={30} />
              </div>
              <div>
                <h4 className="text-base font-black text-white">Request Received!</h4>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-white/60">
                  Your details have been forwarded to the developer. Once added to the Google Cloud Console test users list, you will be able to connect and import your subscriptions.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Registered Google Account</p>
                <p className="text-xs font-mono font-bold text-emerald-300 truncate">{email}</p>
                <p className="text-[10px] text-white/30">Submitted by {name}</p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-primary/85"
                >
                  Done
                </button>
              </div>
            </div>
          ) : existing && !editing ? (
            /* Already registered view */
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3.5 flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-200">Registration Active</p>
                    <span className="rounded-full bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                      Pending Whitelist
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-mono font-bold text-white truncate">{existing.email}</p>
                  <p className="mt-0.5 text-[10px] text-white/40">
                    Registered under <span className="text-white/70 font-semibold">{existing.name || 'User'}</span>{existing.submittedAt ? ` · ${existing.submittedAt}` : ''}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 space-y-2">
                <p className="text-[11px] font-bold text-white/80">How does approval work?</p>
                <p className="text-[11px] leading-relaxed text-white/50">
                  Because Google limits OAuth test users to 100 accounts, the developer manually copies your email into the Google Cloud Console. Once whitelisted, simply click <span className="text-white font-semibold">Import YouTube</span> to load your subscriptions.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy Email'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <span>Use Another Email</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-primary/85"
              >
                Close
              </button>
            </div>
          ) : (
            /* Registration Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3 flex items-start gap-2.5">
                <ShieldAlert size={16} className="text-sky-300 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-sky-200/80">
                  Google limits OAuth apps in testing status to <strong>100 approved test users</strong>. Submit your Google account email below to be whitelisted by the developer.
                </p>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.06] p-3 text-xs font-semibold text-red-200">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="reg-name" className="block text-[11px] font-black uppercase tracking-wider text-white/60">
                  Your Name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  disabled={submitting}
                  autoFocus
                  required
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs font-semibold text-white placeholder-white/25 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reg-email" className="block text-[11px] font-black uppercase tracking-wider text-white/60">
                  Google / YouTube Email Address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-white/30">
                    <Mail size={15} />
                  </div>
                  <input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    disabled={submitting}
                    required
                    className="w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3.5 py-2.5 text-xs font-semibold text-white placeholder-white/25 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </div>
                <p className="text-[10px] text-white/35">
                  Make sure this is the exact Google account you use on YouTube.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-2">
                {existing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      setError(null)
                    }}
                    disabled={submitting}
                    className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_10px_25px_-10px_rgba(var(--c-accent),0.8)] transition-all hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Submitting…</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
