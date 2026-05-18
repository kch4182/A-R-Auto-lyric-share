import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { words as popularEnglishWords } from 'popular-english-words';
import pluralize from 'pluralize';
import { syllable } from 'syllable';
import {
  AlertTriangle,
  ChartPie,
  ClipboardPaste,
  Download,
  FileText,
  Plus,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  Wand2,
  Edit2
} from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#14B8A6', '#8B5CF6', '#64748B'];
const ENGLISH_WORD_PARTS = /[A-Za-z'’-]/;
const ENGLISH_WORD_RANKS = new Map(
  popularEnglishWords.getAll().map((word, index) => [word, index + 1])
);
const UNKNOWN_WORD_RANK = 300000;
const MAX_COMPOUND_PART_RANK = 25000;
const COMPOUND_SCORE_RATIO = 0.35;
const IGNORED_PUNCTUATION = new Set([
  "'", '"', '.', ',', '(', ')', '[', ']', '{', '}', '‘', '’', '“', '”', '-', '–', '—',
]);

const SINGLE_SYLLABLE_COMPARATIVE_BASES = new Set([
  'big', 'dim', 'fat', 'fit', 'flat', 'glad', 'grim', 'hot', 'mad', 'red', 'sad', 'slim', 'thin', 'wet',
]);
const ENGLISH_SUFFIX_PARTS = new Set(['ed', 'er', 'est', 'es', 'ing', 'ly', 's']);

const getWordRank = (word) => ENGLISH_WORD_RANKS.get(word) ?? UNKNOWN_WORD_RANK;

const isCompoundPart = (word) =>
  word.length >= 2 &&
  ENGLISH_WORD_RANKS.has(word) &&
  getWordRank(word) <= MAX_COMPOUND_PART_RANK &&
  !ENGLISH_SUFFIX_PARTS.has(word);

const findCompoundUnitCount = (word) => {
  const wholeRank = getWordRank(word);
  let bestSplitScore = Infinity;

  for (let splitIndex = 2; splitIndex <= word.length - 2; splitIndex += 1) {
    const left = word.slice(0, splitIndex);
    const right = word.slice(splitIndex);

    if (!isCompoundPart(left) || !isCompoundPart(right)) {
      continue;
    }

    const splitScore = getWordRank(left) + getWordRank(right);

    if (splitScore < wholeRank * COMPOUND_SCORE_RATIO) {
      bestSplitScore = Math.min(bestSplitScore, splitScore);
    }
  }

  return Number.isFinite(bestSplitScore) ? 2 : null;
};

const countEnglishSyllables = (word) => {
  const normalizedWord = word
    .replace(/[‘’']/g, '')
    .replace(/[–—]/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalizedWord) return 0;

  const lowerWord = normalizedWord.toLowerCase();
  const baseSyllables = Math.max(syllable(lowerWord), 1);
  const baseCandidates = new Set();
  const singularWord = pluralize.singular(lowerWord);
  const compoundUnitCount = findCompoundUnitCount(lowerWord);

  if (singularWord !== lowerWord) {
    baseCandidates.add(singularWord);
  }

  if (/([b-df-hj-np-tv-z])\1er$/.test(lowerWord)) {
    const comparativeBase = lowerWord.replace(/([b-df-hj-np-tv-z])\1er$/, '$1');
    if (SINGLE_SYLLABLE_COMPARATIVE_BASES.has(comparativeBase)) {
      baseCandidates.add(comparativeBase);
    }
  }

  if (/([b-df-hj-np-tv-z])\1est$/.test(lowerWord)) {
    const comparativeBase = lowerWord.replace(/([b-df-hj-np-tv-z])\1est$/, '$1');
    if (SINGLE_SYLLABLE_COMPARATIVE_BASES.has(comparativeBase)) {
      baseCandidates.add(comparativeBase);
    }
  }

  if (/[bcdfghjklmnpqrstvwxyz]ier$/.test(lowerWord)) {
    baseCandidates.add(lowerWord.replace(/ier$/, 'y'));
  }

  if (/[bcdfghjklmnpqrstvwxyz]iest$/.test(lowerWord)) {
    baseCandidates.add(lowerWord.replace(/iest$/, 'y'));
  }

  const adjustedSyllables = [...baseCandidates]
    .filter((candidate) => candidate.length >= 2)
    .reduce((lowest, candidate) => Math.min(lowest, Math.max(syllable(candidate), 1)), baseSyllables);

  return compoundUnitCount ? Math.min(adjustedSyllables, compoundUnitCount) : adjustedSyllables;
};

const tokenizeLyrics = (text) => {
  const regex = /([a-zA-Z]+(?:[''-][a-zA-Z]+)*)|([\uAC00-\uD7A3])|(\s+)|([^a-zA-Z\uAC00-\uD7A3\s])/g;
  const tokens = [];
  let match;
  let idCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) { 
      tokens.push({ id: idCounter++, type: 'en', text: match[1], count: countEnglishSyllables(match[1]) });
    } else if (match[2]) { 
      tokens.push({ id: idCounter++, type: 'ko', text: match[2], count: 1 });
    } else if (match[3]) { 
      tokens.push({ id: idCounter++, type: 'space', text: match[3], count: 0 });
    } else if (match[4]) { 
      tokens.push({ id: idCounter++, type: 'special', text: match[4], count: IGNORED_PUNCTUATION.has(match[4]) ? 0 : 1 });
    }
  }
  return tokens;
};

const analyzeLyrics = (text, includeSpecialChars) => {
  let total = 0, korean = 0, english = 0, special = 0, index = 0;
  const chars = Array.from(text);

  while (index < chars.length) {
    const char = chars[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[A-Za-z]/.test(char)) {
      let word = char;
      index += 1;
      while (index < chars.length && ENGLISH_WORD_PARTS.test(chars[index])) {
        word += chars[index];
        index += 1;
      }
      const syllableCount = countEnglishSyllables(word);
      english += syllableCount;
      total += syllableCount;
      continue;
    }
    if (/[\uAC00-\uD7A3]/.test(char)) {
      korean += 1; total += 1; index += 1; continue;
    }
    if (IGNORED_PUNCTUATION.has(char)) { index += 1; continue; }
    special += 1;
    if (includeSpecialChars) total += 1;
    index += 1;
  }
  return { total, korean, english, special };
};

const csvField = (value) => `"${String(value).replaceAll('"', '""')}"`;

function App() {
  const [targetShare, setTargetShare] = useState(15);
  const [totalSyllables, setTotalSyllables] = useState(100);
  const [lyricText, setLyricText] = useState('');
  const [includeSpecialChars, setIncludeSpecialChars] = useState(false);
  
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [tokens, setTokens] = useState([]);

  const [editableLyricStats, setEditableLyricStats] = useState({ english: 0, korean: 0, special: 0 });
  const [writers, setWriters] = useState([]);
  const [nameInput, setNameInput] = useState('');
  const [syllableInput, setSyllableInput] = useState('');

  const currentStats = useMemo(() => {
    if (isAnalyzed) {
      let en = 0, ko = 0, sp = 0;
      tokens.forEach(t => {
        if (t.type === 'en') en += t.count;
        if (t.type === 'ko') ko += t.count;
        if (t.type === 'special' && t.count > 0) sp += 1; 
      });
      return { english: en, korean: ko, special: sp };
    } else {
      return analyzeLyrics(lyricText, includeSpecialChars);
    }
  }, [lyricText, tokens, isAnalyzed, includeSpecialChars]);

  useEffect(() => {
    setEditableLyricStats({
      english: currentStats.english,
      korean: currentStats.korean,
      special: currentStats.special,
    });
  }, [currentStats]);

  const lyricStats = useMemo(() => ({
    ...editableLyricStats,
    total: editableLyricStats.english + editableLyricStats.korean + (includeSpecialChars ? editableLyricStats.special : 0),
  }), [editableLyricStats, includeSpecialChars]);

  useEffect(() => {
    if (lyricText.length > 0 || isAnalyzed) {
      setTotalSyllables(lyricStats.total);
    }
  }, [lyricText, isAnalyzed, lyricStats.total]);

  const allocatedSyllables = writers.reduce((sum, writer) => sum + writer.syllables, 0);
  const remainingSyllables = totalSyllables - allocatedSyllables;
  const isOverAllocated = remainingSyllables < 0;
  const distributionProgress = totalSyllables > 0 ? Math.min((allocatedSyllables / totalSyllables) * 100, 100) : 0;

  const calcFinalShare = (syllables) => {
    if (totalSyllables === 0) return 0;
    const share = (syllables / totalSyllables) * targetShare;
    return Math.round(share * 100) / 100;
  };

  const allocatedShare = writers.reduce((sum, writer) => sum + calcFinalShare(writer.syllables), 0);
  const remainingShare = Math.round((targetShare - allocatedShare) * 100) / 100;
  const chartData = [
    ...writers.map((writer) => ({ name: writer.name, share: calcFinalShare(writer.syllables) })),
    { name: '미분배', share: remainingShare > 0 ? remainingShare : 0 },
  ].filter((data) => data.share > 0);

  const handleAddWriter = () => {
    const sylNum = parseInt(syllableInput, 10);
    if (!nameInput.trim()) return alert('작사가 이름을 입력해주세요.');
    if (Number.isNaN(sylNum) || sylNum <= 0) return alert('정확한 글자 수를 입력해주세요.');
    if (sylNum > remainingSyllables) return alert(`남은 글자 수(${remainingSyllables}자)를 초과할 수 없습니다.`);
    setWriters((curr) => [...curr, { name: nameInput.trim(), syllables: sylNum }]);
    setNameInput(''); setSyllableInput('');
  };

  const handleRemoveWriter = (index) => setWriters((curr) => curr.filter((_, i) => i !== index));

  const clearLyrics = () => {
    setLyricText('');
    setIsAnalyzed(false);
    setTokens([]);
    setEditableLyricStats({ english: 0, korean: 0, special: 0 });
    setTotalSyllables(0);
  };

  const handleLyricStatChange = (key, value) => {
    const nextValue = Math.max(parseInt(value, 10) || 0, 0);
    setEditableLyricStats((curr) => ({ ...curr, [key]: nextValue }));
  };

  const executeAnalysis = () => {
    if (!lyricText.trim()) return alert('가사를 먼저 입력해주세요.');
    setTokens(tokenizeLyrics(lyricText));
    setIsAnalyzed(true);
  };

  const handleTokenChange = (id, newCount) => {
    setTokens(tokens.map(t => t.id === id ? { ...t, count: newCount } : t));
  };

  const handleDownloadCSV = () => { 
    if (writers.length === 0) return alert('다운로드할 데이터가 없습니다.');
    const rows = [['이름', '작성 글자 수', '최종 분배 지분(%)'], ...writers.map((w) => [w.name, `${w.syllables}자`, `${calcFinalShare(w.syllables)}%`])];
    if (remainingSyllables > 0) rows.push(['미분배 잔여 지분', `${remainingSyllables}자`, `${remainingShare}%`]);
    rows.push(['총 합계', `${totalSyllables}자`, `${targetShare}%`]);
    const csvContent = `\uFEFF${rows.map((row) => row.map(csvField).join(',')).join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `지분분배표.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-[#f5f6f8] px-4 py-5 text-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        
        <header className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-600 shadow-sm">
              <ChartPie className="h-3.5 w-3.5 text-blue-600" /> Lyric Share Studio
            </div>
            <h1 className="text-3xl font-black tracking-normal text-gray-950 sm:text-4xl">지원이 작사 지분율 계산기</h1>
          </div>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm shadow-sm sm:grid-cols-4">
            <Metric label="총 글자" value={`${totalSyllables}자`} />
            <Metric label="분배" value={`${allocatedSyllables}자`} />
            <Metric label={isOverAllocated ? '초과' : '잔여'} value={`${Math.abs(remainingSyllables)}자`} tone={isOverAllocated ? 'danger' : remainingSyllables === 0 ? 'success' : 'default'} />
            <Metric label="확보 지분" value={`${targetShare}%`} />
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          
          <section className="flex min-h-[720px] flex-col rounded-lg border border-gray-200 bg-white shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-950 text-white">
                  <ClipboardPaste className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-950">가사 분석</h2>
                  <p className="text-sm font-medium text-gray-500">영어 음절, 한글 글자 기준</p>
                </div>
              </div>
              <div className="flex gap-2">
                {isAnalyzed && (
                  <button onClick={() => setIsAnalyzed(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                    <Edit2 className="h-4 w-4" /> 가사 수정
                  </button>
                )}
                <button type="button" onClick={clearLyrics} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 transition hover:border-gray-300 hover:bg-gray-50">
                  초기화
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-4 p-5">
              
              {!isAnalyzed ? (
                <div className="flex flex-1 flex-col gap-3">
                  <textarea
                    value={lyricText}
                    onChange={(event) => setLyricText(event.target.value)}
                    placeholder={`전체 가사를 붙여넣으세요.`}
                    className="h-[480px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-5 py-5 text-[17px] leading-[1.8] text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                  <button 
                    onClick={executeAnalysis}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3.5 text-base font-black text-white shadow-md transition hover:bg-blue-700"
                  >
                    <Wand2 className="h-5 w-5" /> 음절 분석하기
                  </button>
                </div>
              ) : (
                <div className="h-[540px] w-full rounded-lg border border-blue-200 bg-blue-50/30 px-5 py-5 overflow-y-auto relative">
                  <div className="mb-2 pb-3 border-b border-blue-100 flex items-center gap-2 sticky top-0 bg-blue-50/90 backdrop-blur-sm z-10">
                    <p className="text-xs font-bold text-blue-600">
                      ✓ 분석 완료! 파란색 숫자를 클릭해 음절을 수정할 수 있습니다.
                    </p>
                  </div>
                  
                  {/* ⭐️ mt-8을 줘서 1번째 줄이 배너랑 겹치지 않게 확 내림 & leading-[3rem]으로 위아래 쾌적하게 확보 */}
                  <div className="text-[17px] text-gray-900 font-medium whitespace-pre-wrap font-sans leading-[3rem] mt-8">
                    {tokens.map(token => {
                      if (token.type === 'space') return <span key={token.id}>{token.text}</span>;
                      
                      if (token.type === 'en') {
                        return (
                          // ⭐️ 핵심: leading-none을 줘서 상자 크기를 글자에 딱 맞춤 -> 숫자가 위로 날아가지 않음!
                          <span key={token.id} className="relative inline-block mx-0.5 leading-none">
                            <input
                              type="number"
                              min="0"
                              value={token.count}
                              onChange={(e) => handleTokenChange(token.id, parseInt(e.target.value) || 0)}
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-7 text-center text-[12px] font-black text-blue-600 bg-transparent outline-none border-b border-dashed border-blue-300 focus:border-blue-600 focus:bg-blue-50 rounded-sm transition-colors"
                            />
                            <span className="text-red-600 font-extrabold">{token.text}</span>
                          </span>
                        );
                      }
                      
                      if (token.type === 'ko') return <span key={token.id} className="text-gray-900">{token.text}</span>;
                      if (token.type === 'special') return <span key={token.id} className={`${includeSpecialChars ? "text-gray-700" : "text-gray-300"}`}>{token.text}</span>;
                      
                      return null;
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 border-y border-gray-200 py-4 sm:flex-row sm:items-center sm:justify-between mt-auto">
                <label className="inline-flex w-fit cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={includeSpecialChars} onChange={(e) => setIncludeSpecialChars(e.target.checked)} className="peer sr-only" />
                  <span className="flex h-6 w-11 items-center rounded-full bg-gray-200 p-0.5 transition peer-checked:bg-gray-950">
                    <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${includeSpecialChars ? 'translate-x-5' : ''}`} />
                  </span>
                  <span className="text-sm font-black text-gray-800">특수문자 포함</span>
                </label>

                <div className="text-left sm:text-right">
                  <div className="text-sm font-bold text-gray-500">계산된 총 글자 수</div>
                  <div className="text-4xl font-black leading-none text-blue-600">
                    {lyricStats.total}
                    <span className="ml-1 text-xl text-gray-500">자</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                <LyricStat label="영어 음절" value={lyricStats.english} onChange={(value) => handleLyricStatChange('english', value)} />
                <LyricStat label="한글" value={lyricStats.korean} onChange={(value) => handleLyricStatChange('korean', value)} />
                <LyricStat label={includeSpecialChars ? '특수문자 포함' : '특수문자 제외'} value={lyricStats.special} onChange={(value) => handleLyricStatChange('special', value)} />
              </div>
            </div>
          </section>

          <section className="flex min-h-[720px] flex-col rounded-lg border border-gray-200 bg-white shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <SlidersHorizontal className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-950">지분 계산</h2>
                  <p className="text-sm font-medium text-gray-500">참여자별 작성량 배분</p>
                </div>
              </div>
              <button type="button" onClick={handleDownloadCSV} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-sm font-black text-white transition hover:bg-gray-800">
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="확보한 총 작사 지분율" suffix="%" step="0.1" value={targetShare} onChange={setTargetShare} />
                <NumberField label="전체 가사 글자 수" suffix="자" value={totalSyllables} onChange={setTotalSyllables} />
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-gray-950">분배 진행률</div>
                    <div className="text-sm font-medium text-gray-500">{allocatedSyllables}자 / {totalSyllables}자</div>
                  </div>
                  <div className={`rounded-lg px-3 py-1 text-sm font-black ${isOverAllocated ? 'bg-red-50 text-red-600' : remainingSyllables === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {isOverAllocated ? `${Math.abs(remainingSyllables)}자 초과` : `${remainingSyllables}자 잔여`}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full transition-all ${isOverAllocated ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${distributionProgress}%` }} />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="h-[260px] rounded-lg border border-gray-200 p-3">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="48%" innerRadius={58} outerRadius={88} paddingAngle={4} dataKey="share" stroke="none">
                        {chartData.map((entry, index) => <Cell key={`cell-${entry.name}`} fill={entry.name === '미분배' ? '#D1D5DB' : COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value}%`, '최종 지분']} />
                      <Legend verticalAlign="bottom" height={34} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <UsersRound className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-black text-gray-950">작사가 추가</h3>
                  </div>
                  <div className="grid gap-2">
                    <input type="text" placeholder="이름" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddWriter()} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold text-gray-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input type="number" placeholder="작성한 글자 수" value={syllableInput} onChange={(e) => setSyllableInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddWriter()} className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold text-gray-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                      <button type="button" onClick={handleAddWriter} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700">
                        <Plus className="h-4 w-4" /> 추가
                      </button>
                    </div>
                  </div>
                  {isOverAllocated && (
                    <div className="mt-3 flex gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> 전체 글자 수보다 분배 글자 수가 많습니다.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col rounded-lg border border-gray-200">
                <div className="grid grid-cols-[minmax(0,1fr)_96px_96px_44px] border-b border-gray-200 px-4 py-3 text-xs font-black uppercase tracking-normal text-gray-500">
                  <span>참여자</span><span className="text-right">글자 수</span><span className="text-right">지분</span><span />
                </div>
                {writers.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><FileText className="h-5 w-5" /></div>
                    <div><p className="text-sm font-black text-gray-900">아직 추가된 작사가가 없습니다.</p><p className="mt-1 text-sm font-medium text-gray-500">오른쪽 입력창에서 이름과 글자 수를 넣어주세요.</p></div>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {writers.map((writer, index) => (
                      <div key={`${writer.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_96px_96px_44px] items-center px-4 py-3">
                        <span className="truncate pr-3 text-sm font-black text-gray-950">{writer.name}</span>
                        <span className="text-right text-sm font-bold text-gray-600">{writer.syllables}자</span>
                        <span className="text-right text-sm font-black text-blue-600">{calcFinalShare(writer.syllables)}%</span>
                        <button type="button" onClick={() => handleRemoveWriter(index)} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, tone = 'default' }) {
  const toneClass = { default: 'text-gray-950', danger: 'text-red-600', success: 'text-emerald-700' }[tone];
  return (
    <div className="min-w-0 border-r border-gray-200 px-4 py-3 last:border-r-0">
      <div className="text-xs font-bold text-gray-500">{label}</div>
      <div className={`mt-0.5 truncate text-lg font-black ${toneClass}`}>{value}</div>
    </div>
  );
}
Metric.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string.isRequired, tone: PropTypes.oneOf(['default', 'danger', 'success']) };

function LyricStat({ label, value, onChange }) {
  return (
    <label className="block px-3 py-4 text-center">
      <div className="text-xs font-black text-gray-500">{label}</div>
      <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="mx-auto mt-1 block w-full rounded-lg border border-transparent bg-transparent px-1 text-center text-2xl font-black text-gray-950 outline-none transition focus:border-blue-200 focus:bg-blue-50 focus:ring-4 focus:ring-blue-100" />
    </label>
  );
}
LyricStat.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.number.isRequired, onChange: PropTypes.func.isRequired };

function NumberField({ label, suffix, value, onChange, step = '1' }) {
  return (
    <label className="block rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
      <span className="text-xs font-black text-gray-500">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-2xl font-black text-gray-950 outline-none" />
        <span className="text-sm font-black text-gray-500">{suffix}</span>
      </div>
    </label>
  );
}
NumberField.propTypes = { label: PropTypes.string.isRequired, suffix: PropTypes.string.isRequired, value: PropTypes.number.isRequired, onChange: PropTypes.func.isRequired, step: PropTypes.string };

export default App;