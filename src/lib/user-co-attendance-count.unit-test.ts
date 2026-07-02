import { countCoAttendanceGatherings } from './user-co-attendance-count';

type Row = { gathering_id: string | null };

function mockAdmin(responses: {
  viewer?: Row[];
  target?: Row[];
  viewerError?: { code: string };
  targetError?: { code: string };
}) {
  return {
    from(table: string) {
      if (table !== 'user_room_participation_history') throw new Error('unexpected table');
      return {
        select(_cols: string) {
          return {
            eq(_col: string, userId: string) {
              return {
                not(_c: string, _op: string, _val: null) {
                  if (userId !== 'viewer') throw new Error('unexpected viewer id');
                  if (responses.viewerError) return Promise.resolve({ data: null, error: responses.viewerError });
                  return Promise.resolve({ data: responses.viewer ?? [], error: null });
                },
                in(_c: string, ids: string[]) {
                  if (userId !== 'target') throw new Error('unexpected target id');
                  if (responses.targetError) return Promise.resolve({ data: null, error: responses.targetError });
                  const filtered = (responses.target ?? []).filter(
                    (r) => r.gathering_id && ids.includes(r.gathering_id),
                  );
                  return Promise.resolve({ data: filtered, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof countCoAttendanceGatherings>[0];
}

async function run() {
  const same = await countCoAttendanceGatherings(mockAdmin({}), 'a', 'a');
  if (same !== 0) throw new Error('self should be 0');

  const none = await countCoAttendanceGatherings(
    mockAdmin({ viewer: [{ gathering_id: 'g1' }], target: [] }),
    'viewer',
    'target',
  );
  if (none !== 0) throw new Error('no overlap should be 0');

  const two = await countCoAttendanceGatherings(
    mockAdmin({
      viewer: [{ gathering_id: 'g1' }, { gathering_id: 'g2' }, { gathering_id: 'g2' }],
      target: [{ gathering_id: 'g1' }, { gathering_id: 'g3' }],
    }),
    'viewer',
    'target',
  );
  if (two !== 1) throw new Error(`expected 1 overlap, got ${two}`);

  const missing = await countCoAttendanceGatherings(
    mockAdmin({ viewerError: { code: '42P01' } }),
    'viewer',
    'target',
  );
  if (missing !== null) throw new Error('42P01 should return null');

  console.log('user-co-attendance-count unit tests: OK');
}

void run();
