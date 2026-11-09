// A ladder of opponents across three events. Beating one opens the next.

export const CLUBS = [
  { name: 'LOCAL CLUB', theme: 'club' },
  { name: 'CITY OPEN', theme: 'city' },
  { name: 'WORLD FINALS', theme: 'finals' },
];

const kit = (shirt, shorts, hair) => ({ shirt, shorts, hair });

export const OPPONENTS = [
  { club: 0, name: 'ROOKIE', speed: 2.4, reaction: 0.5, skill: 0.6, kit: kit('#4d96ff', '#20304f', '#5a3a22') },
  { club: 0, name: 'RUSTY', speed: 2.7, reaction: 0.45, skill: 0.65, kit: kit('#e4572e', '#2e2e3a', '#b5522b') },
  { club: 0, name: 'NORA', speed: 3, reaction: 0.4, skill: 0.7, kit: kit('#8ac926', '#2f4a2a', '#1d1d24') },
  { club: 0, name: 'BIG MAX', speed: 3.2, reaction: 0.38, skill: 0.74, kit: kit('#ffca3a', '#3a3320', '#3b2a1c') },
  { club: 1, name: 'JUNO', speed: 3.4, reaction: 0.34, skill: 0.78, kit: kit('#c77dff', '#32224a', '#e9d8a6') },
  { club: 1, name: 'DASH', speed: 3.6, reaction: 0.32, skill: 0.8, kit: kit('#00bbf9', '#123a4a', '#14141c') },
  { club: 1, name: 'VEGA', speed: 3.7, reaction: 0.28, skill: 0.83, kit: kit('#f15bb5', '#3e1d36', '#7a2e1d') },
  { club: 1, name: 'ORION', speed: 3.9, reaction: 0.26, skill: 0.86, kit: kit('#00f5d4', '#14403a', '#2a2a30') },
  { club: 2, name: 'ATLAS', speed: 4, reaction: 0.24, skill: 0.88, kit: kit('#ff7b39', '#3a2015', '#111118') },
  { club: 2, name: 'NOVA', speed: 4.1, reaction: 0.22, skill: 0.9, kit: kit('#ffffff', '#2b2b35', '#d9a441') },
  { club: 2, name: 'ZEN', speed: 4.3, reaction: 0.2, skill: 0.93, kit: kit('#222233', '#101018', '#d0d0d8') },
  { club: 2, name: 'THE CHAMP', speed: 4.5, reaction: 0.17, skill: 0.95, kit: kit('#ffd700', '#3a3010', '#20161a') },
];
