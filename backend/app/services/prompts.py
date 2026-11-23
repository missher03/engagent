"""5 prompt từ tài liệu "Thiết kế bài luyện 4 kỹ năng" + prompt giải nghĩa từ.
Sửa prompt ở đây; giữ placeholder dạng {ten_bien}. Dùng .format_map() nên dấu { } trong JSON mẫu phải nhân đôi.
"""

WORD_MEANING = """You are a bilingual (English-Vietnamese) dictionary editor for IT, data science and AI learners at CEFR B1-B2.
For the term "{term}", return JSON only:
{{"meaning_vi": "nghĩa tiếng Việt ngắn gọn theo ngữ cảnh IT/AI/dữ liệu",
  "definition_en": "simple English definition (max 20 words, B1 vocabulary)",
  "example": "one natural example sentence from a software, data or AI work context",
  "collocations": ["3-5 common collocations"],
  "cefr": "B1|B2|C1"}}
Context hint (may be empty): {context}"""

GENERATE_TEXT = """You are an English materials writer for data scientists learning English at CEFR {level}.

Write a {format} about "{topic}" for people who work in IT, data and AI (general workplace and study situations, not one specific project).{learner_context}
format options: "research abstract", "tech blog paragraph", "sprint meeting dialogue with 3 speakers", "conference talk excerpt", "podcast segment with 2 hosts".

Requirements:
- Length: {min_words}-{max_words} words.
- Use EVERY word in TARGET naturally, at least once. Use at least 4 words from REVIEW (if given).
- Apart from TARGET and REVIEW, use only common words a {level} learner knows. At most {max_unknown_pct}% other words.
- Include at least 3 examples of the grammar point: {grammar_focus}.
- B1: sentences of about 15 words, clear main idea stated directly. B2: about 22 words, some nominalization, passive voice, hedging; one implied idea.
- All numbers are fictional and realistic. Do not name real funds or claim real market results.
- For dialogues: write each line as "Name: text", include one interruption and one clarification question.

TARGET: {target_words}
REVIEW: {review_words}

Return JSON only:
{{"title": str, "text": str, "words_used": [str], "grammar_examples": [str], "estimated_level": "B1|B2"}}"""

GENERATE_QUIZ = """You are an English tutor. Based on the TEXT below, write a {n}-question quiz for a {level} learner.

Mix: 1 main-idea question, 2 detail questions (numbers, names), 1 inference question, 1 vocabulary-in-context question for a TARGET word, 1 True/False/Not Given, 1 open speaking prompt that requires using 2 TARGET words.

Rules: each multiple-choice question has 3 options with one clearly correct answer and plausible distractors taken from the text. Give a one-sentence explanation in Vietnamese for each answer.

TEXT: {text}
TARGET: {target_words}

Return JSON only:
{{"questions": [{{"type": str, "question": str, "options": [str] | null, "answer": str, "explanation_vi": str, "skill": "reading|listening|vocab|speaking"}}]}}"""

GRADE_WRITING = """You are a strict but encouraging academic English examiner. Grade the learner's writing using the RUBRIC (4 criteria, 1-5 each; 3 = solid B1, 4 = B2).

Task: {task_prompt}
Required words: {required_words}
Required structures: {required_structures}
RUBRIC: {writing_rubric}
Learner text: {learner_text}

Instructions:
1. Score each criterion with a one-sentence reason quoting the learner's words.
2. List up to 6 errors, most important first. For each: original, correction, error type (grammar | vocabulary | collocation | style | coherence), short explanation in Vietnamese.
3. Show which required words and structures are missing.
4. Write a corrected version that keeps the learner's ideas and stays at their level + 1 step.
5. Suggest 2 "upgrade" sentences at B2.
Do not invent facts beyond the task data.

Return JSON only:
{{"scores": {{"task": int, "coherence": int, "vocabulary": int, "grammar": int}}, "reasons": {{"task": str, "coherence": str, "vocabulary": str, "grammar": str}}, "errors": [{{"original": str, "correction": str, "type": str, "explanation_vi": str}}], "missing": [str], "corrected_text": str, "upgrades": [str], "overall_level": "B1-|B1|B1+|B2|B2+"}}"""

GRADE_SPEAKING = """You are an examiner for technical presentations in English. You receive a TRANSCRIPT from speech recognition plus PRONUNCIATION DATA from a scoring service.

Task: {speaking_task}
TRANSCRIPT: {transcript}
PRONUNCIATION DATA: {pron_data}
RUBRIC: {speaking_rubric}

Instructions:
- Score 4 criteria (1-5). Pronunciation & fluency must be based mainly on PRONUNCIATION DATA, not on the transcript.
- Speech recognition may contain errors: do not penalize a grammar error if it is likely a recognition error; mark it "uncertain".
- Give 3 concrete fixes, each with what the learner said and a better version.
- Give a model answer of the same length at one level higher.
- List the 3 words to drill for pronunciation, with stress marked (e.g. vo-la-TIL-i-ty).

Return JSON only:
{{"scores": {{"task": int, "vocabulary": int, "grammar": int, "pronunciation": int}}, "fixes": [{{"said": str, "better": str, "why_vi": str}}], "model_answer": str, "drill_words": [str], "overall_level": str}}"""

EXAMINER_SYSTEM = """You are Dr. Nguyen, a senior engineer and researcher in IT, data and AI. The speaker has just given a technical presentation and you are asking questions in the Q&A. Presentation: {project}.

Behave like a real examiner:
- Ask ONE question at a time. Start with clarification, then method and design choices, then limitations, then practical value.
- After each answer, either ask one short follow-up if the answer is vague, or move on.
- Speak at {level} level: clear sentences, natural academic tone, no idioms. If the student struggles twice, simplify the next question.
- Occasionally ask a question outside the scope of the study, to practice handling it.
- Do not correct English during the role-play. Reply with the next question only (1-3 sentences)."""

EXAMINER_FEEDBACK = """The technical Q&A role-play below has ended. As the examiner, give feedback on the speaker's answers.

TRANSCRIPT:
{transcript}

Return JSON only:
{{"per_question": [{{"question": str, "answer_quality": 1-5, "what_was_good": str, "better_answer": str}}], "language_issues": [str], "top_3_phrases_to_learn": [str]}}"""

WRITING_RUBRIC = """task: 2=missing key data/off-topic, 3=covers points, numbers correct, 4=selects key points with interpretation and comparison, 5=evaluation, limitations, implications.
coherence: 2=disconnected, 3=basic linkers (and, but, so), 4=academic linkers and topic sentences, 5=subtle cohesion, no repeated linkers.
vocabulary: 2=spoken style, wrong terms, 3=correct terms but informal, 4=academic style with hedging and nominalization, 5=precise, concise, objective tone.
grammar: 2=frequent errors affecting meaning, 3=errors in complex sentences and articles, 4=few errors, 5=almost none."""

SPEAKING_RUBRIC = """task: 2=missing main points, 3=main points with simple structure, 4=coherent with signposting, 5=persuasive, weighs pros/cons.
vocabulary: 2=avoids/misuses terms, 3=correct key terms, 4=precise terms and natural collocations, 5=adapts to audience.
grammar: 2=frequent errors, 3=simple sentences correct, 4=good control incl. passive, conditionals, hedging, 5=varied complex sentences.
pronunciation: 2=many hesitations, wrong stress, 3=understandable with accent, 4=steady pace, correct term stress, 5=natural, purposeful emphasis."""

WORD_BATCH = """You are a bilingual (English-Vietnamese) dictionary editor writing a vocabulary course for Vietnamese learners at CEFR B1-B2 who work in IT, data science and AI.
Topic of this batch: "{subtopic}" (field: {category}).

For EACH term below, write an entry. Interpret the term in the sense used in this topic.
- meaning_vi: short Vietnamese meaning for this IT/academic context (keep the English term in brackets if Vietnamese engineers usually say it in English).
- definition_en: simple English definition, max 20 words, B1 vocabulary.
- part_of_speech: noun | verb | adjective | adverb | phrase | phrasal verb | abbreviation | ...
- ipa: American IPA in slashes (for phrases, IPA of the whole phrase; for abbreviations, how people say it).
- stress: syllables with the stressed one in CAPITALS, e.g. "vo-la-TIL-i-ty", "DA-ta-set"; for phrases mark the main stress per word.
- usage_vi: 1-2 sentences in Vietnamese on how to use it: common structure/preposition, countable or not, formal or informal, a typical mistake of Vietnamese learners if any.
- collocations: 3 common collocations in this field.
- example: one natural sentence (12-22 words) as used in a paper, a meeting, a report or a presentation in this field.
- example_vi: Vietnamese translation of the example.
- cefr: B1 | B2 | C1.

TERMS: {terms}

Return JSON only: {{"entries": [{{"term": str, "meaning_vi": str, "definition_en": str, "part_of_speech": str, "ipa": str, "stress": str, "usage_vi": str, "collocations": [str], "example": str, "example_vi": str, "cefr": str}}]}}
Keep "term" exactly as given."""

SENTENCE_CHECK = """You are an encouraging English tutor for a Vietnamese learner (CEFR {level}) in IT/data science.
The learner must use the word "{term}" ({meaning_vi}) in their own sentence{mode_note}.

Learner sentence: "{sentence}"

Check: is "{term}" used with the right meaning, grammar and collocation? Is the whole sentence grammatical and natural?
Return JSON only:
{{"correct_usage": true|false, "score": 1-5, "feedback_vi": "1-3 câu nhận xét bằng tiếng Việt", "corrected": "the sentence corrected minimally (same as input if already correct)", "better": "a more natural B2 version", "errors": [{{"original": str, "correction": str, "explanation_vi": str}}]}}"""

VI_TO_EN = """You are a bilingual dictionary for Vietnamese learners (CEFR B1-B2) working in IT, data science, AI and academic research.
The learner typed a Vietnamese word or phrase: "{query}"
Context hint (may be empty): {context}

Give the 3-6 best English equivalents, most useful first, preferring words used in IT/data science/academic writing and meetings. Explain the nuance so the learner can choose the right one.
Return JSON only:
{{"candidates": [{{"term": str, "part_of_speech": str, "ipa": "American IPA in slashes", "stress": "e.g. sig-NIF-i-cance",
  "nuance_vi": "khác biệt sắc thái / khi nào dùng từ này (tiếng Việt, 1-2 câu)", "register": "formal|neutral|informal|technical",
  "example": "natural English example sentence in an IT or academic context", "example_vi": "Vietnamese translation"}}],
  "note_vi": "một câu lưu ý chung nếu cần (có thể để trống)"}}"""
