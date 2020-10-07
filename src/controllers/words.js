import {
  keys,
  reduce,
  map,
  filter,
  some,
  uniqBy,
} from 'lodash';
import removePrefix from '../shared/utils/removePrefix';
import Word from '../models/Word';
import { findSearchWord } from '../services/words';
import { NO_PROVIDED_TERM } from '../shared/constants/errorMessages';
import { getDocumentsIds } from '../shared/utils/documentUtils';
import { POPULATE_PHRASE } from '../shared/constants/populateDocuments';
import createRegExp from '../shared/utils/createRegExp';
import { createPhrase, searchPhraseWithIgbo } from './phrases';
import { createExample } from './examples';

/* Either creates a regex pattern for provided searchWord
or fallbacks to matching every word */
const createQueryRegex = (searchWord) => (!searchWord ? /./ : createRegExp(searchWord));

/* Gets words from JSON dictionary */
export const getWordData = (_, res) => {
  const {
    req: { query },
  } = res;
  const searchWord = removePrefix(query.keyword);
  if (!searchWord) {
    res.status(400);
    res.send(NO_PROVIDED_TERM);
  }
  const regexWord = createRegExp(searchWord);
  return res.send(findSearchWord(regexWord, searchWord));
};

/* Searches for a word with Igbo stored in MongoDB */
export const searchWordWithIgbo = (regex) => (
  Word
    .find({ $or: [{ word: { $regex: regex } }, { variations: { $in: [regex] } }] })
    .populate(POPULATE_PHRASE)
);

/* Searches for word with English stored in MongoDB */
export const searchWordWithEnglish = (regex) => (
  Word
    .find({ definitions: { $in: [regex] } })
    .populate(POPULATE_PHRASE)
);

const searchWordWithId = (id) => (
  Word
    .findById(id)
    .populate(POPULATE_PHRASE)
);

/* Returns list of phrases where their parentWord is a word that
hasn't been queried and returned by mongoose */
const filterUniqueParentWords = ({ words, phrases }) => {
  const distinctPhrases = filter(phrases, (phrase) => (
    !some(words, (word) => word.id === phrase.parentWord.toString())
  ));
  return uniqBy(distinctPhrases, (phrase) => phrase.parentWord.toString());
};

/* Finds all parentWords of word phrases that haven't
been queried and returned by mongoose yet */
const getNotYetQueriedParentWords = async ({ words, regex }) => {
  const phrases = await searchPhraseWithIgbo(regex);
  const distinctPhrasesSet = filterUniqueParentWords({ words, phrases });
  const parentWords = map(distinctPhrasesSet, ({ parentWord }) => searchWordWithId(parentWord));
  return Promise.all(parentWords);
};

/* Gets words from MongoDB */
export const getWords = async (_, res) => {
  const {
    req: { query },
  } = res;
  const searchWord = removePrefix(query.keyword || '');
  const regexKeyword = createQueryRegex(searchWord);
  const words = await searchWordWithIgbo(regexKeyword);
  const uniqueParentWords = regexKeyword.toString() !== '/./'
    ? await getNotYetQueriedParentWords({ words, regex: regexKeyword }) : [];

  if (!words.length && !uniqueParentWords.length) {
    return res.send(await searchWordWithEnglish(regexKeyword));
  }
  return res.send([...words, ...uniqueParentWords]);
};

/* Creates Word documents in MongoDB database */
export const createWord = async (data) => {
  const {
    examples,
    word,
    wordClass,
    definitions,
    variations,
  } = data;
  const wordData = {
    word,
    wordClass,
    definitions,
    variations,
  };
  const newWord = new Word(wordData);
  await newWord.save();

  /* Go through each word's phrase and create a Phrase document */
  const phrases = keys(data.phrases);
  const savedPhrases = reduce(phrases, (phrasePromises, phrase) => {
    const phraseInfo = data.phrases[phrase];
    phraseInfo.phrase = phrase;
    phraseInfo.word = newWord.id;
    phrasePromises.push(createPhrase(phraseInfo));
    return phrasePromises;
  }, []);

  /* Go through each word's example and create an Example document */
  const savedExamples = map(examples, async (example) => {
    const exampleData = {
      example,
      parentWord: newWord.id,
    };
    return createExample(exampleData);
  });

  /* Wait for all the Phrases and Examples to be created and then add them to the Word document */
  const resolvedPhrases = await Promise.all(savedPhrases);
  const resolvedExamples = await Promise.all(savedExamples);
  const phraseIds = getDocumentsIds(resolvedPhrases);
  const exampleIds = getDocumentsIds(resolvedExamples);
  newWord.phrases = phraseIds;
  newWord.examples = exampleIds;
  return newWord.save();
};