import requests #Подключаю библиотеку request

BASE = "http://localhost"

def main(): #Создание функции с именем main
    # 1.  должен отвечать 200
    r = requests.get(f"{BASE}/api/health") #Отправляет GET-запрос по адрессу и делает возврат обьекта r
    assert r.status_code == 200, f"health: ожидал 200, получил {r.status_code}" #если условие правда то ничего не происходит.Если лож то программа падает  с этим сообщением
    print(f"[OK] health -> {r.status_code}")

    # 2. должен отвечать 200
    r = requests.get(f"{BASE}/api/entries") #Отправляет GET-запрос по адрессу и делает возврат обьекта r
    assert r.status_code == 200, f"entries: ожидал 200, получил {r.status_code}" #если условие правда то ничего не происходит.Если лож то программа падает  с этим сообщением
    print(f"[OK] entries -> {r.status_code}")

    # 3.  должен отвечать 200
    r = requests.get(f"{BASE}/api/entries/stats")  # Отправляет GET-запрос по адрессу и делает возврат обьекта r
    assert r.status_code == 200, f"stats: ожидал 200, получил {r.status_code}"  # если условие правда то ничего не происходит.Если лож то программа падает  с этим сообщением
    print(f"[OK] stats -> {r.status_code}")


    # 3. Загрузка файла
    r = requests.post(f"{BASE}/api/entries", json={
        "source_text": "hello",
        "translated_text": "привет",
        "source_lang": "en",
        "target_lang": "ru"
        })
    assert r.status_code == 201, f"entries: ожидал 200 но получил {r.status_code}"
    file_id = r.json()["id"]
    print(f"[OK] post -> {r.status_code}")


    r = requests.delete(f"{BASE}/api/entries/{file_id}")
    assert r.status_code == 204, f"delete: ожидал 200 но получил {r.status_code}"
    print(f"[OK] delete -> {r.status_code}")

    r = requests.patch(f"{BASE}/api/entries/{file_id}", json={
        "source_text": "day",
        "translated_text": "день",
        "source_lang": "en",
        "target_lang": "ru",
        "status": "learned"

    })
    assert r.status_code == 200, f"patch: ожидал 200 но получил {r.status_code}"
    print(f"[OK] patch -> {r.status_code}")

    r = requests.get(f"{BASE}/api/entries?search=hello")
    assert r.status_code == 200, f"get: ожидал 200 но получил {r.status_code}"
    print(f"[OK] get -> {r.status_code}")


if __name__ == "__main__":
    main()
