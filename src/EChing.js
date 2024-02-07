document.addEventListener('DOMContentLoaded', async () => {
    // For i18n (but only zh-CN yet)
    let userLanguage = navigator.language;
    let i18nResources = await fetch("src/resource.json").then((response) => response.json());
    let hexagrams = i18nResources[userLanguage].hexagrams || i18nResources["zh-CN"].hexagrams;
    let inscriptions = i18nResources[userLanguage].inscriptions || i18nResources["zh-CN"].inscriptions;

    let timestamp = new Date();
    let lastTime = localStorage.timestamp;

    const md = markdownit();


    // A whole bunch of random.
    // That is how it tells fortune.
    function generateResult() {
        return Array.from({ length: 6 }, () => {
            let sum = Array.from({ length: 3 }, () => Math.floor(Math.random() * 2) + 2).reduce((a, b) => a + b);
            return String(sum % 2);
        }).join('');
    }

    function getChangedLines(result1, result2) {
        return Array.from({ length: 6 }, (_, i) => result1[i] !== result2[i] ? '1' : '0').join('');
    }

    function ching() {
        let result1 = generateResult();
        let result2 = generateResult();
        let changedLines = getChangedLines(result1, result2);
        return [result1, result2, changedLines];
    }
    function generateSessionId() {
        return Array.from({ length: 11 }, () => Math.floor(Math.random() * 32).toString(32)).join('');
    }

    function updateChingResult(chingResults, changedLineDescription) {
        let chingName = document.getElementById("chingName");
        let hexagram = hexagrams[chingResults[0]];

        chingName.innerHTML = `<p>${hexagram[1]}卦，${changedLineDescription}</p><p id="explaination" class="text-2xl text-start">请等待AI解卦结果……</p>`;

    }

    function getIndices(str, char) {
        let idx = str.indexOf(char);
        let indices = [];
        while (idx != -1) {
            indices.push(idx);
            idx = str.indexOf(char, idx + 1);
        }
        return indices;
    }

    function getChangedLineDescription(changedLineNumber, chingResults) {
        if (changedLineNumber === 0) {
            return "无变爻";
        }
        if (changedLineNumber === 6) {
            return "六爻皆变";
        }

        let changedLineDescription = "第";
        let indicies = chingResults[2].split('').map((v, i) => v === "1" ? i + 1 : -1).filter(i => i !== -1);
        changedLineDescription += indicies.join("、") + "爻变";
        changedLineDescription = changedLineDescription.replace(/\d/g, n => '零一二三四五六七八九'[n]);

        return changedLineDescription;
    }

    function getInscription(chingResults, inscriptions, changedLineNumber) {
        let inscription = "";
        let hexogram = hexagrams[chingResults[0]][0];
        if (changedLineNumber == 2 || changedLineNumber == 4) {
            let char = changedLineNumber == 2 ? "1" : "0";
            let indices = getIndices(chingResults[2], char);
            for (const index of indices) {
                inscription += inscriptions[hexogram][index + 1];
            }
        } else if (changedLineNumber == 3 || changedLineNumber == 5) {
            hexogram = hexagrams[chingResults[1]][0];
            if (changedLineNumber == 3) {
                inscription += inscriptions[hexagrams[chingResults[0]][0]][0];
            } else {
                inscription += inscriptions[hexogram][chingResults[2].indexOf("0") + 1];
            }
        } else {
            if (hexogram == 1 || hexogram == 2) {
                inscription += inscriptions[hexogram][7];
            } else {
                hexogram = hexagrams[chingResults[1]][0];
                inscription += inscriptions[hexogram][0];
            }
        }
        return inscription;
    }
    //Thanks Tongyi Qianwen!
    async function explain(inscription, event = localStorage.event,element) {
        return new Promise((resolve) => {
            let sessionId = generateSessionId();
            fetch("https://qwen-qwen1-5-72b-chat.hf.space/queue/join", {
                "headers": {
                    "content-type": "application/json",
                },
                "body": JSON.stringify({
                    "data": [
                        `我想知道${event}，得到的卦辞是“${inscription}”，该如何解释？`,
                        [],
                        "You are a cyber fortune teller. Reply using Markdown. Do not mention what a hexogram is."
                    ],
                    "event_data": null,
                    "fn_index": 0,
                    "trigger_id": 15,
                    "session_hash": sessionId
                }),
                "method": "POST"
            }).then(() => {
                let sse = new EventSource("https://qwen-qwen1-5-72b-chat.hf.space/queue/data?session_hash=" + sessionId);
                sse.onmessage = (event) => {
                    let parsedData = JSON.parse(event.data);
                    if (parsedData.msg == "process_completed") {
                        sse.close();
                        element.innerHTML = md.render(parsedData.output.data[1][0][1]);
                        resolve();
                    } else if (parsedData.msg == "process_generating") {
                        element.innerHTML = md.render(parsedData.output.data[1][0][1]);
                    }
                }
            });
        });
    }

    if (new Date(lastTime).getDate() != timestamp.getDate()) {
        let chingResults = ching();
        let changedLineNumber = chingResults[2].split("1").length - 1;

        //Turn hexagrams into inscriptions
        let inscription = getInscription(chingResults, inscriptions, changedLineNumber);
        let changedLineDescription = getChangedLineDescription(changedLineNumber, chingResults);

        //Output hexagram into HTML
        updateChingResult(chingResults, changedLineDescription);

        //Ask AI (Qwen-14B-Chat here) to explain it
        document.getElementById("explaination").innerHTML = `通义千问说：<p id="explainationBlock" class='block bg-gray-300 text-blank indent-8 border-2 border-gray-800 rounded-lg'></p>`;
        explain(inscription, localStorage.event || "今天的运势", document.getElementById("explainationBlock")).then(() => {
            //Cache the result
            localStorage.setItem("chingResults", chingResults);
            localStorage.setItem("description", changedLineDescription);
            localStorage.setItem("explaination", document.getElementById("explaination").innerHTML);
        });
    }
    else {
        let cachedChingResults = localStorage.chingResults.split(",");
        let cachedChangedLineDescription = localStorage.description;
        let cachedExplaination = localStorage.explaination;

        cachedExplaination = cachedExplaination.replace("<p","<div").replace("</p>","</div>");
        updateChingResult(cachedChingResults, cachedChangedLineDescription);
        document.getElementById("explaination").innerHTML = cachedExplaination;
        alert("为防止滥用，每天只能使用一次。显示的结果为今日占卜结果。\n 再次提醒：本网站仅供娱乐，请勿迷信。")
    }
    localStorage.setItem("timestamp", timestamp);
});


