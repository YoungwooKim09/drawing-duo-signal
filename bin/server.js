#!/usr/bin/env node

import ws from 'ws'
import cors from 'cors'
import http from 'http'
import * as map from 'lib0/map'
import express from 'express'

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1
const wsReadyStateClosing = 2 // eslint-disable-line
const wsReadyStateClosed = 3 // eslint-disable-line

const pingTimeout = 30000

const port = process.env.PORT || 4000
// @ts-ignore
const wss = new ws.Server({ noServer: true })

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

const app = express()

app.use(cors({
  origin: 'https://drawingduo.site',
  credentials: true
}))

/**
 * Map froms topic-name to set of subscribed clients.
 * @type {Map<string, Set<any>>}
 */
const topics = new Map()

/**
 * @param {any} conn
 * @param {object} message
 */
const send = (conn, message) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    conn.close()
  }
  try {
    conn.send(JSON.stringify(message))
  } catch (e) {
    conn.close()
  }
}

/**
 * Setup a new client
 * @param {any} conn
 */
const onconnection = conn => {
  // console.log(conn);
  /**
   * @type {Set<string>}
   */
  const subscribedTopics = new Set()
  let closed = false
  // Check if connection is still alive
  let pongReceived = true
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close()
      clearInterval(pingInterval)
    } else {
      pongReceived = false
      try {
        conn.ping()
      } catch (e) {
        conn.close()
      }
    }
  }, pingTimeout)
  conn.on('pong', () => {
    pongReceived = true
  })
  conn.on('close', () => {
    subscribedTopics.forEach(topicName => {
      const subs = topics.get(topicName) || new Set()
      subs.delete(conn)
      if (subs.size === 0) {
        topics.delete(topicName)
      }
    })
    subscribedTopics.clear()
    closed = true
  })
  conn.on('message', /** @param {object} message */ message => {
    console.log('***- ' + message + ' -***');
    console.log('');
    console.log('');
    if (typeof message === 'string') {
      message = JSON.parse(message)
    }
    if (message && message.type && !closed) {
      switch (message.type) {
        case 'subscribe':
          /** @type {Array<string>} */ (message.topics || []).forEach(topicName => {
            if (typeof topicName === 'string') {
              // add conn to topic
              const topic = map.setIfUndefined(topics, topicName, () => new Set())    // topics안에 topicName에 대한 value가 없으면 새로운 set 추가, 있으면 topicName에 해당하는 value
              topic.add(conn)
              // console.log('##----- ', topic, ' -----##');
              // add topic to conn
              subscribedTopics.add(topicName)
            }
          })
          break
        case 'unsubscribe':
          /** @type {Array<string>} */ (message.topics || []).forEach(topicName => {
            const subs = topics.get(topicName)
            if (subs) {
              subs.delete(conn)
            }
          })
          break
        case 'publish':
          if (message.topic) {
            const receivers = topics.get(message.topic)
            if (receivers) {
              receivers.forEach(receiver =>
                send(receiver, message)
              )
            }
          }
          break
        case 'ping':
          send(conn, { type: 'pong' })
      }
    }
  })
}
wss.on('connection', onconnection)

server.on('upgrade', (request, socket, head) => {
  // You may check auth of request here..
  /**
   * @param {any} ws
   */
  const handleAuth = ws => {
    // if (request.headers.origin) {
    //   const origin = request.headers.origin
    //   // check if origin is allowed
    //   // if so, set headers
    //   socket.setTimeout(0)
    //   const headers = [
    //     'HTTP/1.1 101 Web Socket Protocol Handshake',
    //     'Upgrade: WebSocket',
    //     'Connection: Upgrade',
    //     `Access-Control-Allow-Origin: ${origin}`,
    //     'Access-Control-Allow-Credentials: true',
    //   ]
    // }
    wss.emit('connection', ws, request)
  }
  wss.handleUpgrade(request, socket, head, handleAuth)
})

server.listen(port)

console.log('Signaling server running on localhost:', port)
