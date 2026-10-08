/* ============================================================
   MORNING SUMMARY — top of the Today screen.
   Owner: yesterday's team activity, orders due, payments due,
   quotations waiting, gold with karigars; shareable on WhatsApp.
   Team members: their own day.
   ============================================================ */
'use strict';

function sumCollapsedKey() { return 'sumCollapsed:' + todayStr(); }
function sumIsCollapsed() { try { return localStorage.getItem(sumCollapsedKey()) === '1'; } catch (e) { return false; } }
function sumSetCollapsed(v) { try { localStorage.setItem(sumCollapsedKey(), v ? '1' : '0'); } catch (e) { /* private mode */ } }

async function summaryData() {
  const t = todayStr(), y = todayStr(-1), soon = todayStr(-3);
  const yS = dayStartISO(y), tS = dayStartISO(t);
  const owner = isOwner();
  const meQ = (q, col) => (owner ? q : q.eq(col, S.me.id));
  const res = await Promise.all([
    meQ(db.from('interactions').select('exec_id').gte('happened_at', yS).lt('happened_at', tS).limit(5000), 'exec_id'),
    meQ(db.from('clients').select('created_by').gte('created_at', yS).lt('created_at', tS).limit(5000), 'created_by'),
    db.from('orders').select('status, created_by').eq('order_date', y).limit(5000),
    db.from('orders').select('due_date').in('status', OPEN_STATUSES).not('due_date', 'is', null).lte('due_date', t).limit(5000),
    meQ(db.from('followups').select('due_date').eq('type', 'reminder').eq('status', 'pending').lte('due_date', t).limit(5000), 'assigned_to'),
    typeof payAllEntries === 'function' ? payAllEntries().then((rows) => ({ data: rows })).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    owner ? db.from('orders').select('id').eq('status', 'quote').lte('order_date', soon).limit(5000) : Promise.resolve({ data: [] }),
    owner ? db.from('karigar_txns').select('kind, metal, fine_g').in('kind', ['issue', 'receive', 'wastage']).limit(20000) : Promise.resolve({ data: [] }),
    S.dbv6 ? db.from('order_diamonds').select('id, orders!inner(status)').eq('given', false).in('orders.status', OPEN_STATUSES).limit(5000) : Promise.resolve({ data: [] }),
  ]);
  const meet = res[0].data || [], newCl = res[1].data || [], yOrders = (res[2].data || []).filter((o) => o.status !== 'quote' && CLOSED_STATUSES.indexOf(o.status) === -1),
    due = res[3].data || [], rem = res[4].data || [], pays = res[5].data || [], quotes = res[6].data || [], kt = res[7].data || [],
    dia = res[8].data || [];
  const byExec = new Map();
  meet.forEach((m) => byExec.set(m.exec_id, (byExec.get(m.exec_id) || 0) + 1));
  const PG = typeof payDueGroups === 'function' ? payDueGroups(payIndex(pays)) : { late: [], today: [] };
  let kGold = 0, kSilver = 0;
  kt.forEach((x) => { const v = (x.kind === 'issue' ? 1 : -1) * num(x.fine_g); if (x.metal === 'Silver') kSilver += v; else kGold += v; });
  const myOrders = owner ? yOrders : yOrders.filter((o) => o.created_by === S.me.id);
  return {
    meetings: meet.length, byExec, newClients: newCl.length,
    yOrders: myOrders.length,
    dueToday: due.filter((d) => d.due_date === t).length, overdue: due.filter((d) => d.due_date < t).length,
    remToday: rem.filter((r) => r.due_date === t).length, remOverdue: rem.filter((r) => r.due_date < t).length,
    payLate: PG.late.length, payToday: PG.today.length, quotes: quotes.length, kGold, kSilver, diaToGive: dia.length,
  };
}

async function renderTodaySummary(el) {
  if (!el) return;
  let D;
  try { D = await summaryData(); } catch (e) { el.innerHTML = ''; return; }
  if (!$('#today-summary')) return;
  S.summary = D;
  const owner = isOwner();
  const first = String(S.me.full_name || '').split(' ')[0];
  const hr = new Date().getHours();
  const hello = (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + first : '');
  const line = (icon, html, action) => '<div class="sum-line"' + (action || '') + '><span class="sum-ic">' + icon + '</span><span>' + html + '</span>' + (action ? '<span class="sum-go">›</span>' : '') + '</div>';
  const names = Array.from(D.byExec.entries()).sort((a, b) => b[1] - a[1]).map((e) => esc(String(nameOf(e[0])).split(' ')[0]) + ' ' + e[1]).join(', ');
  const lines = [];
  lines.push(line('🗓️', '<b>Yesterday:</b> ' + D.meetings + ' meeting' + (D.meetings === 1 ? '' : 's') + (owner && names ? ' (' + names + ')' : '') +
    ' · ' + D.newClients + ' new client' + (D.newClients === 1 ? '' : 's') + ' · ' + D.yOrders + ' order' + (D.yOrders === 1 ? '' : 's')));
  if (D.dueToday || D.overdue) lines.push(line('📦', '<b>Orders due:</b> ' + D.dueToday + ' today' + (D.overdue ? ', <span class="o-red">' + D.overdue + ' overdue</span>' : ''), ' data-action="o-goto" data-s="open"'));
  if (D.remToday || D.remOverdue) lines.push(line('⏰', '<b>Reminders:</b> ' + D.remToday + ' today' + (D.remOverdue ? ', <span class="o-red">' + D.remOverdue + ' overdue</span>' : '')));
  if (D.payToday || D.payLate) lines.push(line('💰', '<b>Payments due:</b> ' + D.payToday + ' today' + (D.payLate ? ', <span class="o-red">' + D.payLate + ' overdue</span>' : ''), ' data-action="dues-open"'));
  if (owner && D.quotes) lines.push(line('📝', '<b>Quotations waiting</b> 3+ days: ' + D.quotes, ' data-action="o-goto" data-s="quote"'));
  if (D.diaToGive) lines.push(line('💎', '<b>Diamonds to give vendors:</b> ' + D.diaToGive, ' data-action="dia-todo"'));
  if (owner && (Math.abs(D.kGold) > 0.0005 || Math.abs(D.kSilver) > 0.0005)) {
    lines.push(line('🔨', '<b>With karigars:</b> ' + [Math.abs(D.kGold) > 0.0005 ? 'gold ' + grams(D.kGold) : '', Math.abs(D.kSilver) > 0.0005 ? 'silver ' + grams(D.kSilver) : ''].filter(Boolean).join(', ') + ' fine', ' data-action="k-list"'));
  }
  const collapsed = sumIsCollapsed();
  el.innerHTML = '<div class="card sum-card' + (collapsed ? ' collapsed' : '') + '">' +
    '<div class="sum-head" data-action="sum-toggle"><div><b>' + esc(hello) + '</b><div class="sum-date">' + esc(new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })) + '</div></div>' +
    '<span class="sum-tg">' + (collapsed ? 'Show' : 'Hide') + '</span></div>' +
    '<div class="sum-body">' + lines.join('') +
    (owner ? '<button class="btn btn-small btn-secondary" data-action="sum-share" style="margin-top:8px">Share summary on WhatsApp</button>' : '') +
    '</div></div>';
}

function summaryText() {
  const D = S.summary;
  if (!D) return '';
  const names = Array.from(D.byExec.entries()).sort((a, b) => b[1] - a[1]).map((e) => String(nameOf(e[0])).split(' ')[0] + ' ' + e[1]).join(', ');
  const L = ['*' + bizName() + ' — ' + new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + '*', '',
    'Yesterday: ' + D.meetings + ' meeting' + (D.meetings === 1 ? '' : 's') + (names ? ' (' + names + ')' : '') + ', ' + D.newClients + ' new client' + (D.newClients === 1 ? '' : 's') +
      ', ' + D.yOrders + ' order' + (D.yOrders === 1 ? '' : 's'),
    'Orders due: ' + D.dueToday + ' today' + (D.overdue ? ', ' + D.overdue + ' overdue' : ''),
    'Reminders: ' + D.remToday + ' today' + (D.remOverdue ? ', ' + D.remOverdue + ' overdue' : '')];
  if (D.payToday || D.payLate) L.push('Payments due: ' + D.payToday + ' today' + (D.payLate ? ', ' + D.payLate + ' overdue' : ''));
  if (D.quotes) L.push('Quotations waiting 3+ days: ' + D.quotes);
  if (D.diaToGive) L.push('Diamonds to give vendors: ' + D.diaToGive);
  if (Math.abs(D.kGold) > 0.0005) L.push('Gold with karigars: ' + grams(D.kGold) + ' fine');
  if (Math.abs(D.kSilver) > 0.0005) L.push('Silver with karigars: ' + grams(D.kSilver) + ' fine');
  return L.join('\n');
}

onAct('sum-toggle', () => {
  const c = $('.sum-card');
  if (!c) return;
  const now = !c.classList.contains('collapsed');
  c.classList.toggle('collapsed', now);
  sumSetCollapsed(now);
  const t = c.querySelector('.sum-tg'); if (t) t.textContent = now ? 'Show' : 'Hide';
});
onAct('sum-share', () => window.open(waUrl('', summaryText()), '_blank'));
