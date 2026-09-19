import asyncio
import websockets


TOKEN = "2c944900bf83cbe87f2070af824141fbe80a123f"


async def test_chat():
    socket = await websockets.connect(
        f'ws://127.0.0.1:8000/ws/chat/?token={TOKEN}'
    )

    print('SERVER:', await socket.recv())

    await socket.send(
        '{"message":"Авторизованный тест чата"}'
    )

    print('SERVER:', await socket.recv())

    await socket.close()


asyncio.run(test_chat())