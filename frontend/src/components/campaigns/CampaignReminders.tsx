import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff } from 'lucide-react'
import { getCampaignReminders, updateCampaignReminderConsent } from '#/lib/api/client'

export function CampaignReminders({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['campaign-reminders', campaignId], queryFn: () => getCampaignReminders(campaignId) })
  const mutation = useMutation({ mutationFn: (enabled: boolean) => updateCampaignReminderConsent(campaignId, enabled), onSuccess: value => queryClient.setQueryData(['campaign-reminders', campaignId], value) })
  const reminder = query.data
  if (query.isPending) return <section className="campaign-reminders" aria-busy="true"><p>Loading reminder settings…</p></section>
  if (query.isError || !reminder) return <section className="campaign-reminders"><p role="alert">Reminder settings could not be loaded.</p></section>
  return <section className="campaign-reminders" aria-labelledby="reminders-title">
    <div><p className="eyebrow">In-product only</p><h2 id="reminders-title">Deadline reminders</h2><p>Show approaching deadlines here when you open this campaign. No email or push notifications.</p></div>
    <button type="button" aria-pressed={reminder.enabled} disabled={mutation.isPending} onClick={() => mutation.mutate(!reminder.enabled)}>{reminder.enabled ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}{reminder.enabled ? 'Turn reminders off' : 'Turn reminders on'}</button>
    {reminder.enabled && reminder.items.length ? <ul>{reminder.items.map(item => <li key={`${item.kind}-${item.task_id || 'campaign'}`}><strong>{item.label}</strong><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.deadline))}</span></li>)}</ul> : null}
    {reminder.enabled && !reminder.items.length ? <p className="small-copy muted-copy">No approaching deadlines to surface right now.</p> : null}
    {mutation.isError ? <p role="alert" className="campaign-error">Reminder consent could not be updated.</p> : null}
  </section>
}
