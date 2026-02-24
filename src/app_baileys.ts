import { Boom } from '@hapi/boom'
import makeWASocket, {
	type AnyMessageContent,
	DisconnectReason,
	fetchLatestBaileysVersion,
	useMultiFileAuthState,
	type WASocket
} from './index.js'
import * as fsExtra from 'fs-extra'
import MAIN_LOGGER from './Utils/logger.js'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import https from 'https'
import http from 'http'
import moment from 'moment'
import socketIOClient from 'socket.io-client'
import { Pool, type QueryResult } from 'pg'
import fs from 'fs'
import { createRequire } from 'module'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const require = createRequire(import.meta.url)
// @ts-ignore
const BotController = require('./app/controllers/BotController.cjs')
const controllers: { bot: any } = {
	bot: new BotController()
}
var app = express()
const router = express.Router()
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001
const isLocal = process.env.NODE_ENV === 'local'
let sessions: Record<string, WASocket> = {}
let codigo: string | undefined

// SSL configuration - only load certificates if not in local environment
let certificate: { key: Buffer; cert: Buffer } | undefined
if (!isLocal) {
	const keyPath = process.env.SSL_KEY_PATH || './privkey.pem'
	const certPath = process.env.SSL_CERT_PATH || './cert.pem'
	certificate = {
		key: fs.readFileSync(keyPath),
		cert: fs.readFileSync(certPath)
	}
}
const dataClient = {
	user: 'app',
	host: 'db-postgresql-nyc1-vinapp-jul-9-backup-do-user-4130146-0.b.db.ondigitalocean.com',
	database: 'vinapp_produccion',
	password: 'mikaxyn8blnok0as',
	port: 25060,
	ssl: {
		rejectUnauthorized: false // Esto deshabilita la verificación del certificado
	},
	idleTimeoutMillis: 1000 * 5 /*después de 5 segundos se cierra la conexión*/
}

let clientDB: Pool

const socket = socketIOClient('https://back.vinapp.co:3000', {
	rejectUnauthorized: false
} as any)
socket.on('connect', () => {
	console.log('Socket conectado')
})

const logger = MAIN_LOGGER.child({})
logger.level = 'trace'

// Create server based on environment
let server: http.Server | https.Server
if (isLocal) {
	server = http.createServer(app).listen(port, () => {
		console.log(`Server listening at http://localhost:${port} (Local mode)`)
		connection()
	})
} else {
	server = https.createServer(certificate!, app).listen(port, () => {
		console.log(`Server listening at https://localhost:${port} (Production mode)`)
		connection()
	})
}
server.on('error', error => {
	console.error('Error en el servidor:', error)
})
/*app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}/`);
	connection();
  });*/
app.use('/', router)
app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(cors())

/*
//Osk: No veo necesario cargar el historial del chat.

const store = makeInMemoryStore({ logger })
store?.readFromFile('./baileys_store_multi.json')
// save every 10s
setInterval(() => {
	store?.writeToFile('./baileys_store_multi.json')
}, 10_000)
*/

const index = async (clientID: string | null) => {
	if (clientID != null) {
		console.log('cliente:' + clientID)
		await startSock(clientID)
	} else {
		let sql = `select id_point, telefono_pedidos from points where active_whatsapp_baileys = true;`
		clientDB
			.query(sql)
			.then((res: QueryResult) => {
				console.log(res.rows)
				res.rows.forEach((result: any) => {
					let cod = `${result.id_point}-${result.telefono_pedidos}`
					console.log(cod)
					startSock(cod)
				})
			})
			.catch((e: any) => {
				console.log('Error')
				throw e
			})
	}
}
const connection = async () => {
	try {
		clientDB = new Pool(dataClient)
		await clientDB.connect()
		console.log('Conexión a la base de datos exitosa')
		index(null)
	} catch (error: any) {
		console.error('Error al conectar:', error?.message || error)
	}
}
const startSock = async (clientID: string) => {
	try {
		const { state, saveCreds } = await useMultiFileAuthState(`baileys_auth_info-${clientID}`)
		// fetch latest version of WA Web
		const { version, isLatest } = await fetchLatestBaileysVersion()
		console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

		const sock = makeWASocket({
			printQRInTerminal: true,
			auth: {
				creds: state.creds,
				keys: state.keys
			}
		})
		let phonePedidos = clientID.split('-')[1]
		//Osk: No veo necesario cargar el historial del chat.
		//store?.bind(sock.ev)
		sock.ev.process(async events => {
			if (events['connection.update']) {
				const update = events['connection.update']
				const { connection, lastDisconnect } = update
				if (connection === 'close') {
					let id_p = clientID.split('-')[0]

					let sql = `update points set  active_whatsapp_baileys = false where id_point = '${id_p}'`
					clientDB
						.query(sql)
						.then((res: QueryResult) => {
							console.log('se actualizo false:' + clientID)
						})
						.catch((e: any) => {
							//console.log('Error');
						})

					//Osk: Agregue este bloque para saber razon real de por que se desconecta el bot
					let reason = (lastDisconnect?.error as Boom)?.output?.statusCode

					if (reason === DisconnectReason.badSession) {
						console.error(
							new Date() + '| ERROR DE CONECCION: Bad Session File, Please Delete and Scan Again | ',
							reason
						)
					} else if (reason === DisconnectReason.connectionClosed) {
						console.error(new Date() + '| ERROR DE CONECCION: Connection connectionClosed | ', reason)
					} else if (reason === DisconnectReason.connectionLost) {
						console.error(new Date() + '| ERROR DE CONECCION: Connection connectionLost | ', reason)
					} else if (reason === DisconnectReason.connectionReplaced) {
						console.error(
							new Date() +
								'| ERROR DE CONECCION: Connection Replaced, Another New Session Opened, Please Close Current Session First | ',
							reason
						)
					} else if (reason === DisconnectReason.loggedOut) {
						console.error(new Date() + '| ERROR DE CONECCION: Device Logged Out, Please Login Again | ', reason)
					} else if (reason === DisconnectReason.restartRequired) {
						console.error(new Date() + '| ERROR DE CONECCION: Restart Required, Restarting... | ', reason)
					} else if (reason === DisconnectReason.timedOut) {
						console.error(new Date() + '| ERROR DE CONECCION: Connection TimedOut, Reconnecting... | ', reason)
					}
					//Fin Osk

					if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
						startSock(clientID)
					} else {
						console.log('Connection closed. You are logged out.')
						await fsExtra.remove(`baileys_auth_info-${clientID}`)
					}
				} else if (connection === 'open') {
					let id_p = clientID.split('-')[0]
					let sql = `update points set  active_whatsapp_baileys = true where id_point = '${id_p}'`
					clientDB
						.query(sql)
						.then((res: QueryResult) => {
							console.log('se actualizo true:' + clientID)
						})
						.catch((e: any) => {
							//console.log('Error');
						})
				}
			}
			if (events['creds.update']) {
				console.log(events['creds.update'])
				await saveCreds()
			}
			if (events['messages.upsert']) {
				const message = events['messages.upsert']
				if (
					message &&
					message.messages &&
					message.messages.length > 0 &&
					message.messages[0]?.message &&
					message.messages[0]?.message?.conversation &&
					message.messages[0]?.key?.remoteJid
				) {
					if (message.type !== 'notify') return
					console.log('mensaje: ' + message.messages[0].message.conversation)
					const mensaje = message.messages[0].message.conversation!
					const from = message.messages[0].key.remoteJid!
					const pushName = message.messages[0].pushName!
					const fromMe = message.messages[0].key.fromMe!
					const isGroup = message.messages[0].key.remoteJid!.includes('@g.us')
					if (isGroup) return
					var startdate = new Date()
					const dateTime = moment(startdate).subtract(5, 'h').subtract(40, 'm').format('YYYY-MM-DD HH:mm:ss')
					if (from.length > 16 && mensaje != '') {
						var buscarId = mensaje.split(' ')
						let contador = 0
						let puntero = false
						let phone = '0'
						let phoneClient: string = '0'
						phone = from.slice(2, 12)
						phoneClient = phonePedidos || ''

						//Mensaje de prueba para ver si sigue arriba el bot
						if (mensaje == 'Ping') {
							const whatsappMessage = { text: 'Pong' }
							const targetSession = sessions['165-573001405992']
							if (targetSession) {
								await sendMessageWTyping(whatsappMessage, '573102189987@s.whatsapp.net', targetSession)
							}
						}

						if (from.slice(0, 2) == '52') {
							phone = from.slice(2, 13)
							phoneClient = phonePedidos || ''
						}
						let sql = ''
						if (buscarId[0] == 'Orden' && buscarId.length > 2) {
							let id_order_bot = buscarId[1]
							puntero = true
							sql = `select o.id_companie,o.id_order, o.id_point from tbl_order o inner join points p on o.id_point = p.id_point  where o.id_order = '${id_order_bot}' and o.created_at >=  '${dateTime}' and o.status <> 0 and p.telefono_pedidos = '${phoneClient}' order by 1 desc limit 1`
						} else {
							sql = `select o.id_companie,o.id_order, o.id_point from tbl_order o inner join points p on o.id_point = p.id_point  where o.phone = '${phone}' and o.created_at >=  '${dateTime}' and o.status <> 0 and p.telefono_pedidos = '${phoneClient}' order by 1 desc limit 1`
						}
						clientDB.query(sql).then((res: QueryResult) => {
							//console.log('primera consulta realizada')
							//console.log(res)
							if (res.rows.length > 0) {
								res.rows.forEach((result: any) => {
									if (result) {
										contador = 1
										if (puntero) {
											clientDB.query(`update tbl_order set phone ='${phone}' where id_order = '${result.id_order}'`)
										}
										clientDB.query(
											`insert into log_whatsapp(id_companie, id_order, phone,request,name, from_me,id_point, updated_at,created_at) values (${result.id_companie}, '${result.id_order}', '${phone}', '${mensaje}','${pushName}','${fromMe}','${result.id_point}',now(),now())`
										)
									} else {
										const sql1 = `select id_companie, id_point from points where telefono_pedidos = '${phoneClient}'`
										clientDB
											.query(sql1)
											.then((res: QueryResult) => {
												const id_company = res.rows[0].id_compaie
												const id_point = res.rows[0].id_point
												controllers.bot
													.newMessage(mensaje, from, phoneClient, id_company, pushName, fromMe, id_point)
													.then((res: any) => {
														//console.log(res);
														if (!fromMe) {
															socket.emit('new_messagge', { id_companie: id_company, id_point: id_point })
														}
													})
													.catch((error: any) => {
														console.log('Error [insertMessage]', error)
													})
											})
											.catch((error: any) => {
												console.log('error consulta por telefono de pedidos', error)
											})
									}
								})
							} else {
								console.log('cuarto else')
								const sql1 = `select id_companie, id_point from points where telefono_pedidos = '${phoneClient}'`
								clientDB
									.query(sql1)
									.then((res: QueryResult) => {
										const id_company = res.rows[0].id_companie.toString()
										const id_point = res.rows[0].id_point
										controllers.bot
											.newMessage(mensaje, from, phoneClient, id_company, pushName, fromMe, id_point)
											.then((res: any) => {
												//console.log(res);
												if (!fromMe) {
													socket.emit('new_messagge', { id_companie: id_company, id_point: id_point })
												}
											})
											.catch((error: any) => {
												console.log('Error [insertMessage]', error)
											})
									})
									.catch((error: any) => {
										console.log('error consulta por telefono de pedidos', error)
									})
							}
							const validation = validacionMensajero(phone)
							if (contador == 0 && !validation && !fromMe) msmDiario(phoneClient, phone, sock)
						})
					}
				} else {
					console.log('El objeto "message" o sus propiedades no están definidos como se esperaba :')
					//console.log('message: ' + JSON.stringify(message, null, 2));
				}
			}
		})
		sock.ev.on(
			'connection.update',
			async ({ connection, lastDisconnect, qr, isOnline, isNewLogin, receivedPendingNotifications }) => {
				if (qr) {
					codigo = qr
					let id_p = clientID.split('-')[0]
					let sql = `update points set active_whatsapp_baileys = false, qr_whatsapp_baileys = '${codigo}' where id_point = '${id_p}'`
					clientDB
						.query(sql)
						.then((res: QueryResult) => {
							console.log('se actualizo false y Qr:' + clientID)
						})
						.catch((e: any) => {
							//console.log('Error');
						})
				}
			}
		)

		sessions[clientID] = sock
	} catch (error) {
		console.error('Error en startSock:', error)
	}
}
const sendMessageWTyping = async (msg: AnyMessageContent, jid: string, sock: WASocket) => {
	//Osk. Comentado para agilizar el envio del mensaje.
	//await sock.presenceSubscribe(jid)
	//await delay(500)

	//await sock.sendPresenceUpdate('composing', jid)
	//await delay(2000)

	//await sock.sendPresenceUpdate('paused', jid)s
	try {
		await sock.sendMessage(jid, msg)
	} catch (error) {
		console.error(new Date() + '| Error al enviar mensaje | ', error)
	}
}

const validacionMensajero = (phone: string): boolean => {
	var contador = false
	let sql = `select count(*) from users where phone = '${phone}' and id_tipo_rol = 153`
	clientDB
		.query(sql)
		.then((res: QueryResult) => {
			res.rows.forEach((result: any) => {
				if (result.count > 0) {
					contador = true
				}
			})
		})
		.catch((error: any) => {
			throw error
		})
	return contador
}
const msmDiario = (phoneClient: string, phone: string, client: WASocket) => {
	var startdate = new Date()
	var contador = 0
	var indicador = phoneClient.slice(0, 2)
	const dateTime = moment(startdate).format('YYYY-MM-DD')
	const hours = String(startdate.getHours()).padStart(2, '0')
	const minutes = String(startdate.getMinutes()).padStart(2, '0')
	const seconds = String(startdate.getSeconds()).padStart(2, '0')
	const milliseconds = String(startdate.getMilliseconds()).padStart(3, '0')
	const time = `${dateTime} ${hours}:${minutes}:${seconds}.${milliseconds}`

	console.log('Entre al msmDiario:  Number: ' + phone)
	console.log('dateTime: ' + dateTime)

	let sql = `select count(*) from log_cliente_wpp where numero = '${phone}' and to_char(created_at,'yyyy-mm-dd')='${dateTime}'`
	clientDB
		.query(sql)
		.then((res: QueryResult) => {
			res.rows.forEach((result: any) => {
				if (result.count > 0) {
					contador = 1
				} else {
					clientDB.query(
						`insert into log_cliente_wpp(numero,updated_at,created_at) values ('${phone}',CURRENT_TIMESTAMP - INTERVAL '5 hours',CURRENT_TIMESTAMP - INTERVAL '5 hours')`
					)
				}
			})
			if (contador == 0) msmAutomatico(phoneClient, indicador + phone + '@s.whatsapp.net', client)
			console.log('contador:', contador)
			console.log('phoneClient:', phoneClient)
		})
		.catch((error: any) => {
			throw error
		})
}
const msmAutomatico = (phoneClient: string, to: string, client: WASocket) => {
	//Osk. Para pruebas con el telefono de fidelizacion
	if (phoneClient != '573001405992') {
		let sql = `select cs.uri,cs.name,p.welcome_message_status,p.welcome_message from points p INNER JOIN companie_store cs ON cs.id_companie = p.id_companie where p.telefono_pedidos = '${phoneClient}' and status = 1 limit 1`
		clientDB
			.query(sql)
			.then((res: QueryResult) => {
				res.rows.forEach((result: any) => {
					console.log(result)
					if (result) {
						let whatsappMessage = {
							text: `¡Hola bienvenido/a a ${result.name}! Nos encanta brindarte el mejor servicio ⚡️Si deseas agilizar el proceso puedes realizar tu pedido haciendo click aquí 👇🏻: 👉🏻  https://vinapp.co/${result.uri} Por favor indica allí todos tus datos de entrega, también puedes especificar lo detalles de tu pedido en los comentarios u observaciones. ¡GRACIAS POR PREFERIRNOS ❤️!`
						}
						if (result.welcome_message) whatsappMessage = { text: `${result.welcome_message}` }
						try {
							if (result.welcome_message_status) {
								sendMessageWTyping(whatsappMessage, to, client)
								console.log(new Date() + ' Mensaje de bienvenido enviado Correctamente, numero: ' + phoneClient)
							}
						} catch (error) {
							console.log('Error:', error)
						}
					}
				})
			})
			.catch((error: any) => {
				throw error
			})
	}
}

app.get('/qr/:id', async (req: Request, res: Response) => {
	let id = req.params.id as string
	await index(id)
	setTimeout(function () {
		console.log(codigo)
		res.send(codigo)
	}, 1000)
})
app.get('/delete/:id', async (req: Request, res: Response) => {
	try {
		let id = req.params.id as string
		let id_p = id.split('-')[0]
		let sql = `update points set  active_whatsapp_baileys = false where id_point = '${id_p}'`

		await clientDB.query(sql)
		console.log('se actualizo false:' + id)

		await fsExtra.remove(`baileys_auth_info-${id}`)
		console.log('sesión eliminada:' + id)

		res.status(200).json({
			success: true,
			message: 'Sesión eliminada correctamente',
			id: id
		})
	} catch (error) {
		console.error('Error al eliminar sesión:', error)
		res.status(500).json({
			success: false,
			error: 'Error al eliminar la sesión'
		})
	}
})
//Osk. Le cambie el nombre  de send a send_test, por que hay dos rutas que se llaman igual, linea 403
app.post('/send_test', async (req: Request, res: Response) => {
	console.log('Entre al send test: ')
	if (!req.body || !req.body.message) {
		return res.status(400).json({ error: 'El parámetro "message" es obligatorio en el cuerpo del request.' })
	}
	const { id, message, to } = req.body
	console.log('Punto: ' + id)
	const whatsappMessage = { text: message }
	const targetSession = sessions[id]
	if (targetSession) {
		await sendMessageWTyping(whatsappMessage, to, targetSession)
	}

	res.send('Función ejecutada con éxito')
})
app.post('/send', async (req: Request, res: Response) => {
	console.log('Entre al send (Confirmar Orden): ')
	let message = ''
	message = req.body.body
	if (message != '' && sessions[req.body.id] && req.body.phone) {
		const { id, to } = req.body
		const whatsappMessage = { text: message }
		const targetSession = sessions[id]
		if (targetSession) {
			try {
				await sendMessageWTyping(whatsappMessage, to, targetSession)
				console.log('Mensaje Enviado Correctamente (Confirmar Orden)')
				if (req.body.id_order) {
					let sql = `select id_companie,id_order,id_point from tbl_order where id_order = '${req.body.id_order}' limit 1`
					clientDB
						.query(sql)
						.then((res: QueryResult) => {
							res.rows.forEach((result: any) => {
								if (result) {
									clientDB.query(
										`insert into log_whatsapp(id_companie, id_order, phone,request,name,from_me,id_point,updated_at,created_at) values (${result.id_companie}, '${result.id_order}', '${req.body.phone}', '${message}','${req.body.name}','true','${result.id_point}',now(),now())`
									)
								}
							})
						})
						.catch((error: any) => {
							throw error
						})
				} else {
					console.log('sin id-order')
				}
			} catch (error) {
				console.log('Error:', error)
				res.end('500')
			}
		}
	}
	res.end('bien')
})
app.post('/send-test', async (req: Request, res: Response) => {
	let message = 'Mensaje periodico de prueba de funcionamiento de VinBot'
	let numbers = ['573137031390@s.whatsapp.net', '573102189987@s.whatsapp.net', '573218544332@s.whatsapp.net']
	const targetSession = sessions['165-573001405992']
	for (let i = 0; i < numbers.length; i++) {
		if (targetSession) {
			const whatsappMessage = { text: message }
			try {
				const numberToSend = numbers[i]
				if (numberToSend) {
					await sendMessageWTyping(whatsappMessage, numberToSend, targetSession)
					console.log('Mensaje de prueba Enviado Correctamente')
					res.end('200')
				}
			} catch (error) {
				console.log('Error:', error)
				res.end('500')
			}
		}
	}
	res.end('bien')
})
app.post('/send-ms', async (req: Request, res: Response) => {
	let message = ''
	message = req.body.body
	if (message != '' && sessions[req.body.id]) {
		const { id, to } = req.body
		const whatsappMessage = { text: message }
		const targetSession = sessions[id]
		if (targetSession) {
			try {
				await sendMessageWTyping(whatsappMessage, to, targetSession)
				console.log('Mensaje de prueba Enviado Correctamente')
				res.end('200')
			} catch (error) {
				console.log('Error:', error)
				res.end('500')
			}
		}
	} else {
		res.end('500')
	}
})
app.post('/send-ai', async (req: Request, res: Response) => {
	let message = ''
	message = req.body.body
	if (message != '' && sessions[req.body.id]) {
		const { id, to } = req.body
		const whatsappMessage = { text: message }
		const targetSession = sessions[id]
		if (targetSession) {
			try {
				await sendMessageWTyping(whatsappMessage, to, targetSession)
				console.log('Mensaje de prueba Enviado Correctamente')
				res.end('200')
			} catch (error) {
				console.log('Error:', error)
				res.end('500')
			}
		}
	} else {
		res.end('500')
	}
	res.end('Send AI')
})
