/**
 * Responses shaped like the official pages ("Perguntas e respostas", "Gerenciamento de perguntas
 * e respostas", read on 21/11/2026), trimmed of fields the integration does not read. The seller
 * of the examples is 419059118.
 */
export const QUESTION_SELLER_ID = "419059118";

export const UNANSWERED_QUESTION = {
  date_created: "2020-08-20T13:22:01.600-04:00",
  item_id: "MLB1623490410",
  seller_id: 419059118,
  status: "UNANSWERED",
  text: "Serve no modelo de 2019?",
  id: 11436370259,
  deleted_from_listing: false,
  hold: false,
  answer: null,
  from: { id: 419067349 },
};

export const ANSWERED_QUESTION = {
  ...UNANSWERED_QUESTION,
  status: "ANSWERED",
  answer: {
    text: "Serve sim, do 2015 em diante.",
    status: "ACTIVE",
    date_created: "2020-08-20T14:02:10.000-04:00",
  },
};

/** The by-id answer of version 4 dates with nanoseconds. */
export const QUESTION_WITH_NANOSECONDS = {
  id: 11751825075,
  seller_id: 419059118,
  buyer_id: 56801932,
  item_id: "MLB1623490410",
  deleted_from_listing: false,
  suspected_spam: false,
  status: "UNANSWERED",
  hold: false,
  text: "Tem na cor azul?",
  app_id: 8304540643508652,
  date_created: "2021-02-08T17:51:21.746608612Z",
  last_updated: "2021-02-08T17:51:29.184950392Z",
  answer: null,
};

export const BANNED_QUESTION = {
  ...UNANSWERED_QUESTION,
  id: 11764926522,
  status: "BANNED",
  text: "",
};

export const OTHER_SELLER_QUESTION = { ...UNANSWERED_QUESTION, seller_id: 999 };
