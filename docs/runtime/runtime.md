# The Recording

On most configurations, we record the audio from the master device's microphone and send it to the LLM for processing. We **never** store it, not even locally.

# On LLM Ping

In the case of the automated (sometimes), worriless or customized (sometimes) modes, we may ping the LLM to ask it based on the transcript collected via the master device's microphone.
Based on what the LLM decides, we may prompt a question to all students and optionally (if configured) notify the teacher first and ask them if it's okay to do so.

# On Question

As students answer, we save the data (by default, marking all those who haven't answered yet as "not answered") to local storage and wait for them to answer. We display the output to the teacher in real time with full detailed self-updating statistics. We also make sure to save all this to history, which will be in local storage. There will also be import and export functionality for them.