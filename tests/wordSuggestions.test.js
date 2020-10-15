import chai from 'chai';
import { forEach, forIn, isEqual } from 'lodash';
import {
  suggestNewWord,
  updateWordSuggestion,
  getWordSuggestions,
  getWordSuggestion,
} from './shared/commands';
import {
  wordSuggestionData,
  malformedWordSuggestionData,
  updatedWordSuggestionData,
} from './__mocks__/suggestions';

const { expect } = chai;

const WORD_SUGGESTION_KEYS = [
  'originalWordId',
  'word',
  'wordClass',
  'definitions',
  'variations',
  'details',
  'approvals',
  'denials',
  'updatedOn',
  'merged',
  'id',
];

describe('MongoDB Word Suggestions', () => {
  describe('/POST mongodb wordSuggestions', () => {
    it('should save submitted word suggestion', (done) => {
      suggestNewWord(wordSuggestionData)
        .end((_, res) => {
          expect(res.status).to.equal(200);
          expect(res.body.id).to.not.equal(undefined);
          done();
        });
    });

    it('should return a word error because of malformed data', (done) => {
      suggestNewWord(malformedWordSuggestionData)
        .end((_, res) => {
          expect(res.status).to.equal(400);
          expect(res.body.error).to.not.equal(undefined);
          done();
        });
    });

    it.only('should return a word error because invalid id', (done) => {
      const malformedData = { ...wordSuggestionData, originalWordId: 'ok123' };
      suggestNewWord(malformedData)
        .end((_, res) => {
          expect(res.status).to.equal(400);
          expect(res.body.error).to.not.equal(undefined);
          done();
        });
    });
  });

  describe('/PUT mongodb wordSuggestions', () => {
    it('should update specific wordSuggestion with provided data', (done) => {
      suggestNewWord(wordSuggestionData)
        .then((res) => {
          expect(res.status).to.equal(200);
          updatedWordSuggestionData.id = res.body.id;
          updateWordSuggestion(updatedWordSuggestionData)
            .end((_, result) => {
              expect(result.status).to.equal(200);
              forIn(updatedWordSuggestionData, (value, key) => {
                expect(isEqual(result.body[key], value)).to.equal(true);
              });
              done();
            });
        });
    });

    it('should return an example error because of malformed data', (done) => {
      suggestNewWord(wordSuggestionData)
        .then((res) => {
          expect(res.status).to.equal(200);
          updateWordSuggestion(malformedWordSuggestionData)
            .end((_, result) => {
              expect(result.status).to.equal(400);
              done();
            });
        });
    });

    describe('/GET mongodb wordSuggestions', () => {
      it.only('should return all word suggestions', (done) => {
        Promise.all([suggestNewWord(wordSuggestionData), suggestNewWord(wordSuggestionData)])
          .then(() => {
            getWordSuggestions()
              .end((_, res) => {
                expect(res.status).to.equal(200);
                expect(res.body).to.have.lengthOf(2);
                forEach(res.body, (wordSuggestion) => {
                  expect(wordSuggestion).to.have.all.keys(WORD_SUGGESTION_KEYS);
                });
                done();
              });
          });
      });

      it.only('should return one word suggestion', (done) => {
        suggestNewWord(wordSuggestionData)
          .then((res) => {
            getWordSuggestion(res.body.id)
              .end((_, result) => {
                expect(result.status).to.equal(200);
                expect(result.body).to.be.an('object');
                expect(result.body).to.have.all.keys(WORD_SUGGESTION_KEYS);
                done();
              });
          });
      });
    });
  });
});