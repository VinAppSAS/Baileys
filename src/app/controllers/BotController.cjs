
const { Op } = require('sequelize');
const Bot = require('../models/Bot.cjs');
const BotDetail = require('../models/BotDetail.cjs');

class BotController {
    async newMessage(body,number,to,id_company,name,from_me,id_point) {
        try {
            const fechaActual = new Date();
            const año = fechaActual.getFullYear();
            const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
            const dia = String(fechaActual.getDate()).padStart(2, '0');
            const hora = String(fechaActual.getHours()).padStart(2, '0');
            const minutos = String(fechaActual.getMinutes()).padStart(2, '0');
            const segundos = String(fechaActual.getSeconds()).padStart(2, '0');
            const dateNow = `${año}-${mes}-${dia} ${hora}:${minutos}:${segundos}`;
            const fechaInicio = `${año}-${mes}-${dia} 00:00:00`;
            const fechaFin = `${año}-${mes}-${dia} 23:59:59`;
            var numero = '';
            var telefono_pedidos = '';
            if(from_me){
                numero = to;
                telefono_pedidos = number;
            } else{
                numero = number;
                telefono_pedidos = to;
            }
            const conversation = await Bot.findOne({
                where:{ 
                    [Op.and]: [
                        { numero: numero },
                        { id_company: id_company },
                        { created_at: {
                                [Op.between]: [fechaInicio, fechaFin]
                            } 
                        }
                    ]
                },
                order: [['id', 'DESC']],
            });
            if (conversation) {
                conversation.unread++;
                conversation.updated_at=dateNow;
                await conversation.save();
                BotDetail.create({
                    id_bot: conversation.id,
                    mensaje: body,
                    id_point: id_point,
                    from_me: from_me,
                    created_at: dateNow
                })
                    .then(() => {
                        console.log('mensaje Guardado dentro de la conversacion')
                        return true;
                    })
                    .catch((error) => {
                        console.log(error);
                        return;
                    });
            } else{
                if(!from_me){
                    const newConversation = await Bot.create({
                        numero: number,
                        id_company: id_company,
                        telefono_pedidos: telefono_pedidos,
                        id_point: id_point,
                        created_at: dateNow,
                        updated_at: dateNow,
                        attention: false,
                        name: name,
                        unread: 1
                    })
                        .then((res) => {
                            BotDetail.create({
                                id_bot: res.id,
                                mensaje: body,
                                id_point: id_point,
                                from_me: from_me,
                                created_at: dateNow
                            })
                                .then(() => {
                                    console.log('mensaje Guardado dentro de la conversacion')
                                    return true;
                                })
                                .catch((error) => {
                                    console.log(error);
                                    return;
                                });
                            console.log('conversacion creada')
                            return true;
                        })
                        .catch((error) => {
                            console.log(error);
                            return;
                        });
                }
            }
        } catch (error) {
            console.error('Error al obtener la conversacion:', error);
        }
    }
}
module.exports = BotController;