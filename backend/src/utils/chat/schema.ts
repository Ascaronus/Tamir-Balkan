import type {Knex} from 'knex'
import {defaultChatConfig} from '../../shared/chat-config'
export const chatSchema=`
CREATE TABLE IF NOT EXISTS tamir_chat_settings(id integer PRIMARY KEY CHECK(id=1),config jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tamir_chat_secret(name text PRIMARY KEY,ciphertext text NOT NULL);
CREATE TABLE IF NOT EXISTS tamir_chat_operator(id uuid PRIMARY KEY,name text NOT NULL,user_id text UNIQUE,telegram_id text UNIQUE,role text NOT NULL CHECK(role IN ('viewer','operator','manager')),enabled boolean NOT NULL,available boolean NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tamir_chat_guest(hash text PRIMARY KEY,profile jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS tamir_chat_conversation(id uuid PRIMARY KEY,number bigserial UNIQUE,customer_id text,guest_hash text REFERENCES tamir_chat_guest(hash) ON DELETE CASCADE,profile jsonb NOT NULL,locale text NOT NULL CHECK(locale IN ('sr','en')),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),context jsonb,telegram_chat_id text,telegram_thread_id bigint,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK((customer_id IS NOT NULL)::int+(guest_hash IS NOT NULL)::int=1));
CREATE INDEX IF NOT EXISTS tamir_chat_owner ON tamir_chat_conversation(customer_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS tamir_chat_guest_owner ON tamir_chat_conversation(guest_hash);
CREATE UNIQUE INDEX IF NOT EXISTS tamir_chat_thread ON tamir_chat_conversation(telegram_chat_id,telegram_thread_id) WHERE telegram_thread_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS tamir_chat_message(id uuid PRIMARY KEY,seq bigserial UNIQUE,conversation_id uuid NOT NULL REFERENCES tamir_chat_conversation(id) ON DELETE CASCADE,sender text NOT NULL CHECK(sender IN ('customer','operator','system')),original text NOT NULL,translated text,source_language text,target_language text,locale text NOT NULL,translation_state text NOT NULL DEFAULT 'pending',status text NOT NULL DEFAULT 'sent',client_id text NOT NULL,operator_id uuid,telegram_message_id bigint,telegram_chat_id text,seen_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(conversation_id,client_id));
CREATE INDEX IF NOT EXISTS tamir_chat_message_page ON tamir_chat_message(conversation_id,seq);
CREATE TABLE IF NOT EXISTS tamir_chat_outbox(message_id uuid PRIMARY KEY REFERENCES tamir_chat_message(id) ON DELETE CASCADE,attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now(),done boolean NOT NULL DEFAULT false,error_code text);
CREATE TABLE IF NOT EXISTS tamir_chat_telegram_ref(chat_id text NOT NULL,telegram_id bigint NOT NULL,message_id uuid NOT NULL REFERENCES tamir_chat_message(id) ON DELETE CASCADE,PRIMARY KEY(chat_id,telegram_id));
CREATE TABLE IF NOT EXISTS tamir_chat_update(key text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tamir_chat_event(id bigserial PRIMARY KEY,kind text NOT NULL,code text,actor_id text,conversation_id uuid REFERENCES tamir_chat_conversation(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tamir_chat_connection(service text PRIMARY KEY,state text NOT NULL,details jsonb NOT NULL DEFAULT '{}',checked_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tamir_chat_rate(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
`
export async function setupChat(db:Knex){await db.raw(chatSchema);await db('tamir_chat_settings').insert({id:1,config:JSON.stringify(defaultChatConfig)}).onConflict('id').ignore()}
