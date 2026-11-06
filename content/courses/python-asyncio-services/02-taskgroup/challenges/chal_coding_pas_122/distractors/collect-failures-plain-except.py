# @piece collect-failures: Note which services failed
except ApiError as error:
    failed = [error.service]
