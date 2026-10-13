import { loadEnv } from 'vite';
import { createKnowledgeBase } from './retrieval.js';

const knowledge = createKnowledgeBase(loadEnv('development', process.cwd(), ''));
console.log(await knowledge.indexCorpus());
