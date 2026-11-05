import { EmptyState, PageHead } from '../components/ui'

export default function Placeholder({ title, icon }) {
  return (
    <>
      <PageHead title={title} />
      <div className="card">
        <EmptyState icon={icon} title="Coming soon">
          This section is being built.
        </EmptyState>
      </div>
    </>
  )
}
