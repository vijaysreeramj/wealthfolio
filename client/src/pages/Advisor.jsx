import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Icon from '../components/Icon'
import { ErrorBox, Loading, PageHead } from '../components/ui'
import { useApi } from '../hooks/data'
import { api } from '../lib/api'
import { fmtDate } from '../lib/format'

const SUGGESTIONS = [
  ['Personal finance', 'Where am I overspending, and how much more could I realistically save each month?'],
  ['Portfolio', 'Review my investment portfolio: allocation, concentration and the main risks.'],
  ['Stock research', 'Give me a research report on HDFC Bank as a long-term investment.'],
  ['Market', 'How could the latest RBI policy decision affect banking and NBFC stocks?'],
  ['Goals & FIRE', 'Am I on track for my goals and FIRE? What should I change first?'],
  ['Stock research', 'Compare TCS and Infosys on growth, margins, ROCE and valuation.'],
]

function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {c}
            </a>
          ),
          table: ({ children: c }) => (
            <div className="table-wrap">
              <table className="table">{c}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function Sources({ sources }) {
  if (!sources?.length) return null
  return (
    <details className="sources">
      <summary>
        {sources.length} source{sources.length > 1 ? 's' : ''}
      </summary>
      <ol>
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
            <span className="subtle"> · {new URL(s.url).hostname.replace(/^www\./, '')}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

/** POST and read the server-sent event stream. */
async function streamChat(body, onEvent, signal) {
  const res = await fetch('/api/advisor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `Request failed (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()
    for (const part of parts) {
      if (part.startsWith('data: ')) onEvent(JSON.parse(part.slice(6)))
    }
  }
}

function SetupCard({ model }) {
  return (
    <div className="card card-pad stack" style={{ maxWidth: 720 }}>
      <div className="row">
        <span className="empty-icon" style={{ margin: 0 }}>
          <Icon name="advisor" />
        </span>
        <div>
          <h2>Connect the AI advisor</h2>
          <p className="muted">The advisor uses Claude ({model}) with web search for up-to-date Indian market research.</p>
        </div>
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
        <li>
          Create an API key at{' '}
          <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">
            platform.claude.com
          </a>
          .
        </li>
        <li>
          Add it to <code>server/.env</code>: <code>ANTHROPIC_API_KEY=sk-ant-…</code>
        </li>
        <li>Restart the server (stop and rerun <code>npm run dev</code>).</li>
      </ol>
      <p className="subtle">Your financial summary is sent to the AI only when you ask a question, and only to answer it.</p>
    </div>
  )
}

export default function Advisor() {
  const status = useApi(() => api.get('/advisor/status'), [])
  const threads = useApi(() => api.get('/advisor/threads'), [])
  const [threadId, setThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)
  const [showThreads, setShowThreads] = useState(false)
  const endRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, activity])
  useEffect(() => () => abortRef.current?.abort(), [])

  const openThread = async (id) => {
    setShowThreads(false)
    setError(null)
    if (!id) {
      setThreadId(null)
      setMessages([])
      return
    }
    const t = await api.get(`/advisor/threads/${id}`)
    setThreadId(t.id)
    setMessages(t.messages)
  }

  const deleteThread = async (id) => {
    if (!confirm('Delete this conversation?')) return
    await api.del(`/advisor/threads/${id}`)
    if (id === threadId) openThread(null)
    threads.reload()
  }

  const send = async (text) => {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setInput('')
    setError(null)
    setBusy(true)
    setActivity('Reviewing your finances')
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: message }, { id: 'pending', role: 'assistant', content: '', pending: true }])
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamChat(
        { message, thread_id: threadId },
        (ev) => {
          if (ev.type === 'thread') setThreadId(ev.thread_id)
          else if (ev.type === 'status') setActivity(ev.text)
          else if (ev.type === 'text')
            setMessages((m) => m.map((x) => (x.id === 'pending' ? { ...x, content: x.content + ev.text } : x)))
          else if (ev.type === 'done') setMessages((m) => m.map((x) => (x.id === 'pending' ? ev.message : x)))
          else if (ev.type === 'error') {
            setError(ev.message)
            setMessages((m) => m.filter((x) => x.id !== 'pending' || x.content))
          }
        },
        controller.signal,
      )
      threads.reload()
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
      setMessages((m) => m.filter((x) => x.id !== 'pending' || x.content))
    } finally {
      setMessages((m) => m.map((x) => (x.id === 'pending' ? { ...x, pending: false, id: `a${Date.now()}` } : x)))
      setBusy(false)
      setActivity(null)
    }
  }

  const head = (
    <PageHead title="AI Financial Advisor" subtitle="Research and guidance on your finances and the Indian market, from an evidence-based, risk-aware analyst.">
      {status.data?.configured && (
        <>
          <button className="btn hide-desktop" onClick={() => setShowThreads(!showThreads)}>
            <Icon name="history" /> History
          </button>
          <button className="btn" onClick={() => openThread(null)} disabled={busy}>
            <Icon name="plus" /> New chat
          </button>
        </>
      )}
    </PageHead>
  )

  if (status.error) return <>{head}<ErrorBox error={status.error} onRetry={status.reload} /></>
  if (!status.data) return <>{head}<Loading /></>
  if (!status.data.configured) return <>{head}<SetupCard model={status.data.model} /></>

  return (
    <>
      {head}
      <div className="advisor">
        <aside className={`card advisor-threads ${showThreads ? 'open' : ''}`}>
          <div className="subtle" style={{ padding: '12px 14px 6px', fontWeight: 600 }}>
            Conversations
          </div>
          {threads.data?.length === 0 && <p className="subtle" style={{ padding: '0 14px 12px' }}>None yet.</p>}
          {threads.data?.map((t) => (
            <div key={t.id} className={`thread-item ${t.id === threadId ? 'on' : ''}`}>
              <button onClick={() => openThread(t.id)} disabled={busy}>
                <span className="ellipsis">{t.title}</span>
                <span className="subtle">{fmtDate(t.created_at)}</span>
              </button>
              <button className="icon-btn" onClick={() => deleteThread(t.id)} aria-label="Delete conversation">
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </aside>

        <section className="card advisor-chat">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <div className="empty-icon">
                  <Icon name="advisor" />
                </div>
                <h2>Ask about your money or the markets</h2>
                <p className="muted">
                  The advisor sees a summary of your budgets, investments, net worth, goals and FIRE plan, and searches the web for the latest company and market data.
                </p>
                <div className="suggestions">
                  {SUGGESTIONS.map(([tag, q]) => (
                    <button key={q} className="suggestion" onClick={() => send(q)}>
                      <span className="badge badge-info">{tag}</span>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="bubble user">
                    {m.content}
                  </div>
                ) : (
                  <div key={m.id} className="bubble assistant">
                    {m.content ? <Markdown>{m.content}</Markdown> : null}
                    {m.pending && (
                      <div className="typing">
                        <span className="dots">
                          <i />
                          <i />
                          <i />
                        </span>
                        {activity || (m.content ? '' : 'Thinking')}
                      </div>
                    )}
                    <Sources sources={m.sources} />
                  </div>
                ),
              )
            )}
            {error && (
              <div className="alert alert-danger">
                <Icon name="alert" />
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <textarea
              className="textarea"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask about your budget, portfolio, a stock (e.g. 'Research Asian Paints') or the market…"
              maxLength={4000}
              aria-label="Message"
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            ) : (
              <button className="btn btn-primary" disabled={!input.trim()} aria-label="Send">
                <Icon name="send" />
              </button>
            )}
          </form>
          <p className="disclaimer" style={{ padding: '0 16px 12px' }}>
            <Icon name="info" />
            <span>
              Educational research, not personalised advice from a SEBI-registered adviser. AI can make mistakes, so verify key figures with the cited sources. The advisor never places trades.
            </span>
          </p>
        </section>
      </div>
    </>
  )
}
