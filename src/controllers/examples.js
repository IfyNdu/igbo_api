import { exampleSchema } from '../models/Example';
import { packageResponse, handleQueries } from './utils';
import { searchExamplesRegexQuery } from './utils/queries';
import { findExamplesWithMatch } from './utils/buildDocs';
import { createDbConnection, handleCloseConnection } from '../services/database';
import { getCachedExamples, setCachedExamples } from './utils/RedisAPI';

/* Create a new Example object in MongoDB */
export const createExample = async (data, connection) => {
  const Example = connection.model('Example', exampleSchema);
  const example = new Example(data);
  return example.save();
};

/* Uses regex to search for examples with both Igbo and English */
const searchExamples = ({
  query,
  version,
  skip,
  limit,
}) => (
  findExamplesWithMatch({
    match: query,
    version,
    skip,
    limit,
  })
);

/* Returns examples from MongoDB */
export const getExamples = async (req, res, next) => {
  try {
    const {
      version,
      searchWord,
      keywords,
      regex,
      skip,
      limit,
      redisClient,
      isUsingMainKey,
      ...rest
    } = await handleQueries(req);
    const regexMatch = !isUsingMainKey && !searchWord ? ({
      igbo: { $exists: false },
    }) : searchExamplesRegexQuery(regex);
    const redisExamplesCacheKey = `example-${searchWord}-${skip}-${limit}-${version}`;
    const cachedExamples = await getCachedExamples({ redisClient, redisExamplesCacheKey });
    let examples;
    let contentLength;
    if (cachedExamples) {
      examples = cachedExamples.examples;
      contentLength = cachedExamples.contentLength;
    } else {
      const allExamples = await searchExamples({
        query: regexMatch,
        version,
        skip,
        limit,
      });
      examples = allExamples.examples;
      contentLength = allExamples.contentLength;
      if (!redisClient.isFake) {
        await setCachedExamples({
          redisClient,
          redisExamplesCacheKey,
          examples,
          contentLength,
        });
      }
    }

    return packageResponse({
      res,
      docs: examples,
      contentLength,
      ...rest,
    });
  } catch (err) {
    return next(err);
  }
};

export const findExampleById = async (id) => {
  const connection = createDbConnection();
  const Example = connection.model('Example', exampleSchema);
  try {
    const example = await Example.findById(id);
    await handleCloseConnection(connection);
    return example;
  } catch (err) {
    await handleCloseConnection(connection);
    throw err;
  }
};

/* Returns an example from MongoDB using an id */
export const getExample = async (req, res, next) => {
  try {
    const { id } = req.params;
    const foundExample = await findExampleById(id)
      .then((example) => {
        if (!example) {
          throw new Error('No example exists with the provided id.');
        }
        return example;
      });
    return res.send(foundExample);
  } catch (err) {
    return next(err);
  }
};
