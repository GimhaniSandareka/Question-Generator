import { NextRequest, NextResponse} from "next/server";
import { ChatOpenAI} from "@langchain/openai";
import { HumanMessage} from "@langchain/core/messages";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import {JsonOutputFunctionsParser} from "langchain/output_parsers";

export async function POST(req: NextRequest) {
    const body = await req.formData();
    const document = body.get("pdf");

    try{
        const pdfLoader = new PDFLoader(document as Blob, {
            parsedItemSeparator: " "
        });

        const docs = await pdfLoader.load();

        // If there's any empty pages, then filter them out and send the actual content
        const selectedDocuments = docs.filter((doc) => doc.pageContent !== undefined);
        // Analyze only texts (if it has images, then skip them)
        const texts = selectedDocuments.map((doc) => doc.pageContent);

        const prompt = "given the text which is a summary of the document, generate a quiz based on the text, Return json only that contains a quiz object with fields: name, description and questions. The questions is an array of objects with fields: questionText, answers. The answers is an array of objects with fields: answerText, isCorrect.";

        if(! process.env.OPENAI_API_KEY){
            return NextResponse.json(
                {error: "OpenAI API key not provided."},
                {status: 500});
        }

        const model = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: "o3-mini",
            //modelName: "gpt-4-1106-preview"
            //modelName: "GPT-4o"
        });

        const parser = new JsonOutputFunctionsParser();
        const extractionFunctionSchema = {
            name: "extractor",
            description: "Extracts fields from the output",
            parameters: {
                type: "object",
                properties: {
                    name: {type: "string"},
                    description: {type: "string"},
                    questions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                questionText: {type: "string"},
                                answers: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            answerText: {type: "string"},
                                            isCorrect: {type: "boolean"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const runnable = model.bind({
            functions: [extractionFunctionSchema],
            function_call: {name: "extractor"},
        }).pipe(parser);

        const message =  new HumanMessage({
            content: [
                {
                    type: "text",
                    text: prompt + "\n" + texts.join("\n"),
                },
            ],


        });

        const result = await runnable.invoke([message]);
        console.log(result);
        return NextResponse.json(
            {message: "Created successfully."},
            {status: 200});
    } catch (e: any) {
        return NextResponse.json({error: e.message}, {status: 500});
    }
}

