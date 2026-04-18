/** 三択の表示順を決定的に入れ替え、correctIndex を追従させる（モデルの「正解は上」バイアス対策） */

export function shuffleQuizChoicesDeterministic(
  choices: [string, string, string],
  correctIndex: 0 | 1 | 2,
  seed: number,
): { choices: [string, string, string]; correctIndex: 0 | 1 | 2 } {
  const perm: [number, number, number] = [0, 1, 2];
  let x = seed ^ 0xdeadbeef;
  for (let i = 2; i > 0; i--) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    const j = x % (i + 1);
    const t = perm[i];
    perm[i] = perm[j]!;
    perm[j] = t!;
  }
  const next: [string, string, string] = [
    choices[perm[0]!]!,
    choices[perm[1]!]!,
    choices[perm[2]!]!,
  ];
  let newCorrect: 0 | 1 | 2 = 0;
  for (let k = 0; k < 3; k++) {
    if (perm[k] === correctIndex) {
      newCorrect = k as 0 | 1 | 2;
      break;
    }
  }
  return { choices: next, correctIndex: newCorrect };
}
