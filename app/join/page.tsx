import { Suspense } from "react";
import { JoinView } from "@/components/student/join-view";

export const metadata = { title: "Join" };

export default function JoinPage() {
    return (
        <Suspense>
            <JoinView/>
        </Suspense>
    );
}
